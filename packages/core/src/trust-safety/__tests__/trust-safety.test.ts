/**
 * Trust & Safety Tests
 *
 * Phase 43: Tests for connector vulnerability scanning, reputation scoring, and trust signals.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryVulnerabilityStore,
  InMemoryReputationStore,
  TrustManager,
  createTrustManager,
  DEFAULT_SCORING_WEIGHTS,
  TRUST_LEVEL_THRESHOLDS,
  VulnerabilitySeverity,
} from '../index.js';

// =============================================================================
// InMemoryVulnerabilityStore Tests
// =============================================================================

describe('InMemoryVulnerabilityStore', () => {
  let store: InMemoryVulnerabilityStore;

  beforeEach(() => {
    store = new InMemoryVulnerabilityStore();
  });

  describe('record()', () => {
    it('should record vulnerability', async () => {
      const vuln = await store.record({
        connectorId: 'connector-1',
        version: '1.0.0',
        severity: 'high',
        status: 'open',
        title: 'SQL Injection',
        description: 'SQL injection in query builder',
        affectedVersions: ['1.0.0', '1.0.1'],
        references: ['https://cve.example.com/CVE-2025-1234'],
      });

      expect(vuln.id).toMatch(/^vuln_/);
      expect(vuln.title).toBe('SQL Injection');
      expect(vuln.discoveredAt).toBeDefined();
    });

    it('should record with CVE info', async () => {
      const vuln = await store.record({
        connectorId: 'connector-1',
        version: '1.0.0',
        severity: 'critical',
        status: 'open',
        cveId: 'CVE-2025-1234',
        title: 'RCE Vulnerability',
        description: 'Remote code execution',
        affectedVersions: ['1.0.0'],
        cvssScore: 9.8,
        vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        references: [],
      });

      expect(vuln.cveId).toBe('CVE-2025-1234');
      expect(vuln.cvssScore).toBe(9.8);
    });
  });

  describe('get()', () => {
    it('should get vulnerability by ID', async () => {
      const created = await store.record({
        connectorId: 'connector-1',
        version: '1.0.0',
        severity: 'medium',
        status: 'open',
        title: 'XSS Vulnerability',
        description: 'Cross-site scripting',
        affectedVersions: ['1.0.0'],
        references: [],
      });

      const retrieved = await store.get(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.title).toBe('XSS Vulnerability');
    });

    it('should return null for non-existent', async () => {
      const result = await store.get('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getByConnector()', () => {
    beforeEach(async () => {
      await store.record({
        connectorId: 'connector-1',
        version: '1.0.0',
        severity: 'high',
        status: 'open',
        title: 'Vuln 1',
        description: 'Desc 1',
        affectedVersions: ['1.0.0'],
        references: [],
      });

      await store.record({
        connectorId: 'connector-1',
        version: '1.1.0',
        severity: 'medium',
        status: 'open',
        title: 'Vuln 2',
        description: 'Desc 2',
        affectedVersions: ['1.1.0'],
        references: [],
      });

      await store.record({
        connectorId: 'connector-2',
        version: '1.0.0',
        severity: 'low',
        status: 'open',
        title: 'Vuln 3',
        description: 'Desc 3',
        affectedVersions: ['1.0.0'],
        references: [],
      });
    });

    it('should get all vulnerabilities for connector', async () => {
      const vulns = await store.getByConnector('connector-1');
      expect(vulns).toHaveLength(2);
    });

    it('should filter by version', async () => {
      const vulns = await store.getByConnector('connector-1', '1.0.0');
      expect(vulns).toHaveLength(1);
      expect(vulns[0].title).toBe('Vuln 1');
    });
  });

  describe('update()', () => {
    it('should update vulnerability', async () => {
      const vuln = await store.record({
        connectorId: 'connector-1',
        version: '1.0.0',
        severity: 'high',
        status: 'open',
        title: 'Test Vuln',
        description: 'Test',
        affectedVersions: ['1.0.0'],
        references: [],
      });

      const updated = await store.update(vuln.id, {
        status: 'fixed',
        fixedVersion: '1.0.1',
      });

      expect(updated.status).toBe('fixed');
      expect(updated.fixedVersion).toBe('1.0.1');
    });

    it('should throw for non-existent', async () => {
      await expect(store.update('non-existent', { status: 'fixed' })).rejects.toThrow();
    });
  });

  describe('scan()', () => {
    it('should scan connector and return results', async () => {
      await store.record({
        connectorId: 'connector-1',
        version: '1.0.0',
        severity: 'critical',
        status: 'open',
        title: 'Critical Vuln',
        description: 'Critical',
        affectedVersions: ['1.0.0'],
        references: [],
      });

      await store.record({
        connectorId: 'connector-1',
        version: '1.0.0',
        severity: 'high',
        status: 'open',
        title: 'High Vuln',
        description: 'High',
        affectedVersions: ['1.0.0'],
        references: [],
      });

      const result = await store.scan('connector-1', '1.0.0');

      expect(result.connectorId).toBe('connector-1');
      expect(result.summary.total).toBe(2);
      expect(result.summary.critical).toBe(1);
      expect(result.summary.high).toBe(1);
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it('should exclude fixed vulnerabilities', async () => {
      const vuln = await store.record({
        connectorId: 'connector-1',
        version: '1.0.0',
        severity: 'high',
        status: 'open',
        title: 'Test Vuln',
        description: 'Test',
        affectedVersions: ['1.0.0'],
        references: [],
      });

      await store.update(vuln.id, { status: 'fixed' });

      const result = await store.scan('connector-1', '1.0.0');
      expect(result.summary.total).toBe(0);
    });

    it('should provide recommendations for critical vulnerabilities', async () => {
      await store.record({
        connectorId: 'connector-1',
        version: '1.0.0',
        severity: 'critical',
        status: 'open',
        title: 'Critical Vuln',
        description: 'Critical',
        affectedVersions: ['1.0.0'],
        references: [],
      });

      const result = await store.scan('connector-1', '1.0.0');
      expect(result.recommendations).toContain('Immediate action required: Critical vulnerabilities detected');
    });
  });
});

// =============================================================================
// InMemoryReputationStore Tests
// =============================================================================

describe('InMemoryReputationStore', () => {
  let store: InMemoryReputationStore;

  beforeEach(() => {
    store = new InMemoryReputationStore();
  });

  describe('get()', () => {
    it('should return null for unknown connector', async () => {
      const result = await store.get('unknown');
      expect(result).toBeNull();
    });
  });

  describe('update()', () => {
    it('should create reputation if not exists', async () => {
      const reputation = await store.update('connector-1', {
        trustLevel: 'trusted',
        overallScore: 80,
      });

      expect(reputation.connectorId).toBe('connector-1');
      expect(reputation.trustLevel).toBe('trusted');
      expect(reputation.overallScore).toBe(80);
    });

    it('should update existing reputation', async () => {
      await store.update('connector-1', { overallScore: 50 });
      const updated = await store.update('connector-1', { overallScore: 75 });

      expect(updated.overallScore).toBe(75);
    });
  });

  describe('addSignal()', () => {
    it('should add trust signal', async () => {
      const signal = await store.addSignal('connector-1', {
        type: 'security_audit',
        connectorId: 'connector-1',
        value: 95,
        weight: 0.25,
        source: 'external_auditor',
      });

      expect(signal.id).toMatch(/^sig_/);
      expect(signal.type).toBe('security_audit');
      expect(signal.value).toBe(95);
    });

    it('should update reputation signals', async () => {
      await store.update('connector-1', {});

      await store.addSignal('connector-1', {
        type: 'code_review',
        connectorId: 'connector-1',
        value: 85,
        weight: 0.2,
        source: 'internal_review',
      });

      const reputation = await store.get('connector-1');
      expect(reputation!.signals).toHaveLength(1);
    });
  });

  describe('calculateScore()', () => {
    it('should return default score with no signals', async () => {
      const score = await store.calculateScore('unknown');
      expect(score).toBe(50);
    });

    it('should calculate weighted average', async () => {
      await store.addSignal('connector-1', {
        type: 'security_audit',
        connectorId: 'connector-1',
        value: 100,
        weight: 0.5,
        source: 'auditor',
      });

      await store.addSignal('connector-1', {
        type: 'code_review',
        connectorId: 'connector-1',
        value: 80,
        weight: 0.5,
        source: 'reviewer',
      });

      const score = await store.calculateScore('connector-1');
      expect(score).toBe(90); // (100*0.5 + 80*0.5) / 1.0
    });

    it('should exclude expired signals', async () => {
      await store.addSignal('connector-1', {
        type: 'security_audit',
        connectorId: 'connector-1',
        value: 100,
        weight: 0.5,
        source: 'auditor',
        validUntil: new Date(Date.now() - 1000), // Expired
      });

      await store.addSignal('connector-1', {
        type: 'code_review',
        connectorId: 'connector-1',
        value: 60,
        weight: 0.5,
        source: 'reviewer',
      });

      const score = await store.calculateScore('connector-1');
      expect(score).toBe(60); // Only non-expired signal counts
    });
  });
});

// =============================================================================
// TrustManager Tests
// =============================================================================

describe('TrustManager', () => {
  let manager: TrustManager;

  beforeEach(() => {
    manager = createTrustManager();
  });

  describe('scanConnector()', () => {
    it('should scan and return results', async () => {
      const result = await manager.scanConnector('connector-1', '1.0.0');

      expect(result.connectorId).toBe('connector-1');
      expect(result.scannedAt).toBeDefined();
    });

    it('should add scan signal to reputation', async () => {
      await manager.scanConnector('connector-1', '1.0.0');

      const reputation = await manager.getReputation('connector-1');
      expect(reputation).not.toBeNull();
      expect(reputation!.signals.some((s) => s.type === 'vulnerability_scan')).toBe(true);
    });
  });

  describe('addTrustSignal()', () => {
    it('should add signal and update score', async () => {
      await manager.addTrustSignal(
        'connector-1',
        'security_audit',
        95,
        'external_auditor',
        { reportId: 'audit-123' }
      );

      const reputation = await manager.getReputation('connector-1');
      expect(reputation).not.toBeNull();
      expect(reputation!.overallScore).toBeGreaterThan(50);
    });

    it('should clamp value to 0-100', async () => {
      const signal = await manager.addTrustSignal('connector-1', 'code_review', 150, 'source');
      expect(signal.value).toBe(100);
    });

    it('should use default weights', async () => {
      const signal = await manager.addTrustSignal('connector-1', 'security_audit', 90, 'source');
      expect(signal.weight).toBe(DEFAULT_SCORING_WEIGHTS.security_audit);
    });
  });

  describe('updateReputationScore()', () => {
    it('should set trust level based on score', async () => {
      await manager.addTrustSignal('connector-1', 'security_audit', 95, 'source');
      await manager.addTrustSignal('connector-1', 'code_review', 92, 'source');
      await manager.addTrustSignal('connector-1', 'official_endorsement', 100, 'source');

      const reputation = await manager.updateReputationScore('connector-1');

      expect(reputation.overallScore).toBeGreaterThanOrEqual(90);
      expect(reputation.trustLevel).toBe('verified');
    });

    it('should handle low scores', async () => {
      await manager.addTrustSignal('connector-1', 'vulnerability_scan', 20, 'scanner');

      const reputation = await manager.updateReputationScore('connector-1');
      // Score of 20 is below untrusted threshold (25), so it's 'blocked'
      expect(reputation.trustLevel).toBe('blocked');
    });
  });

  describe('createPolicy()', () => {
    it('should create security policy', async () => {
      const policy = await manager.createPolicy({
        tenantId: 'tenant-1',
        name: 'Production Policy',
        minTrustLevel: 'trusted',
        maxVulnerabilitySeverity: 'medium',
        blockUnscanned: true,
        autoUpdate: false,
        requiredSignals: ['security_audit'],
        allowedConnectors: [],
        blockedConnectors: ['bad-connector'],
      });

      expect(policy.id).toMatch(/^policy_/);
      expect(policy.name).toBe('Production Policy');
    });
  });

  describe('evaluatePolicy()', () => {
    let policyId: string;

    beforeEach(async () => {
      const policy = await manager.createPolicy({
        tenantId: 'tenant-1',
        name: 'Test Policy',
        minTrustLevel: 'trusted',
        maxVulnerabilitySeverity: 'medium',
        blockUnscanned: true,
        autoUpdate: false,
        requiredSignals: ['security_audit'],
        allowedConnectors: [],
        blockedConnectors: ['blocked-connector'],
      });
      policyId = policy.id;
    });

    it('should allow connector with good reputation', async () => {
      await manager.addTrustSignal('good-connector', 'security_audit', 90, 'auditor');
      await manager.addTrustSignal('good-connector', 'code_review', 85, 'reviewer');

      const result = await manager.evaluatePolicy(policyId, 'good-connector', '1.0.0');

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should block connector in blocklist', async () => {
      const result = await manager.evaluatePolicy(policyId, 'blocked-connector', '1.0.0');

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.type === 'blocked_connector')).toBe(true);
    });

    it('should block unscanned connector', async () => {
      const result = await manager.evaluatePolicy(policyId, 'new-connector', '1.0.0');

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.type === 'unscanned')).toBe(true);
    });

    it('should block connector with insufficient trust', async () => {
      await manager.addTrustSignal('low-trust', 'vulnerability_scan', 30, 'scanner');

      const result = await manager.evaluatePolicy(policyId, 'low-trust', '1.0.0');

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.type === 'insufficient_trust')).toBe(true);
    });

    it('should warn about missing required signals', async () => {
      await manager.addTrustSignal('partial-trust', 'code_review', 80, 'reviewer');
      await manager.addTrustSignal('partial-trust', 'official_endorsement', 85, 'official');

      const result = await manager.evaluatePolicy(policyId, 'partial-trust', '1.0.0');

      expect(result.warnings).toContain('Missing required trust signal: security_audit');
    });

    it('should throw for non-existent policy', async () => {
      await expect(manager.evaluatePolicy('non-existent', 'connector', '1.0.0')).rejects.toThrow();
    });
  });

  describe('getPoliciesForTenant()', () => {
    it('should get all policies for tenant', async () => {
      await manager.createPolicy({
        tenantId: 'tenant-1',
        name: 'Policy 1',
        minTrustLevel: 'trusted',
        maxVulnerabilitySeverity: 'high',
        blockUnscanned: false,
        autoUpdate: false,
        requiredSignals: [],
        allowedConnectors: [],
        blockedConnectors: [],
      });

      await manager.createPolicy({
        tenantId: 'tenant-1',
        name: 'Policy 2',
        minTrustLevel: 'community',
        maxVulnerabilitySeverity: 'critical',
        blockUnscanned: false,
        autoUpdate: true,
        requiredSignals: [],
        allowedConnectors: [],
        blockedConnectors: [],
      });

      await manager.createPolicy({
        tenantId: 'tenant-2',
        name: 'Other Policy',
        minTrustLevel: 'verified',
        maxVulnerabilitySeverity: 'low',
        blockUnscanned: true,
        autoUpdate: false,
        requiredSignals: [],
        allowedConnectors: [],
        blockedConnectors: [],
      });

      const policies = await manager.getPoliciesForTenant('tenant-1');
      expect(policies).toHaveLength(2);
      expect(policies.every((p) => p.tenantId === 'tenant-1')).toBe(true);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('Constants', () => {
  it('should have default scoring weights', () => {
    expect(DEFAULT_SCORING_WEIGHTS.security_audit).toBe(0.25);
    expect(DEFAULT_SCORING_WEIGHTS.code_review).toBe(0.2);
    expect(Object.values(DEFAULT_SCORING_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);
  });

  it('should have trust level thresholds', () => {
    expect(TRUST_LEVEL_THRESHOLDS.verified).toBe(90);
    expect(TRUST_LEVEL_THRESHOLDS.trusted).toBe(75);
    expect(TRUST_LEVEL_THRESHOLDS.community).toBe(50);
    expect(TRUST_LEVEL_THRESHOLDS.untrusted).toBe(25);
    expect(TRUST_LEVEL_THRESHOLDS.blocked).toBe(0);
  });
});
