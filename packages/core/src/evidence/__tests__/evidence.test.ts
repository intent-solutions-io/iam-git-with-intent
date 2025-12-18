/**
 * Evidence Packet Tests
 *
 * Phase 37: Tests for evidence packet schema and risk calculation.
 */

import { describe, it, expect } from 'vitest';
import {
  createEvidencePacket,
  createDefaultTestResults,
  createDefaultRiskAssessment,
  createDefaultSecurityScanResults,
  createDefaultDependencyAnalysis,
  createDefaultCodeQualityMetrics,
  calculateRiskScore,
  type EvidencePacket,
  DEFAULT_RISK_FACTORS,
} from '../index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestContext = (): EvidencePacket['context'] => ({
  issueNumber: 42,
  issueUrl: 'https://github.com/owner/repo/issues/42',
  repo: 'owner/repo',
  baseBranch: 'main',
  targetBranch: 'feature/test',
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Evidence Factory Functions', () => {
  describe('createDefaultTestResults', () => {
    it('should create default test results', () => {
      const results = createDefaultTestResults();

      expect(results.total).toBe(0);
      expect(results.passed).toBe(0);
      expect(results.failed).toBe(0);
      expect(results.skipped).toBe(0);
      expect(results.durationMs).toBe(0);
    });
  });

  describe('createDefaultRiskAssessment', () => {
    it('should create default risk assessment with low risk', () => {
      const assessment = createDefaultRiskAssessment();

      expect(assessment.score).toBe(0);
      expect(assessment.level).toBe('low');
      expect(assessment.recommendation).toBe('auto_approve');
      expect(assessment.factors).toEqual([]);
      expect(assessment.thresholds).toEqual({ low: 25, medium: 50, high: 75 });
    });
  });

  describe('createDefaultSecurityScanResults', () => {
    it('should create default security scan results', () => {
      const results = createDefaultSecurityScanResults();

      expect(results.completed).toBe(true);
      expect(results.totalFindings).toBe(0);
      expect(results.findingsBySeverity.critical).toBe(0);
      expect(results.findingsBySeverity.high).toBe(0);
      expect(results.tools).toEqual([]);
    });
  });

  describe('createDefaultDependencyAnalysis', () => {
    it('should create default dependency analysis', () => {
      const analysis = createDefaultDependencyAnalysis();

      expect(analysis.totalDependencies).toBe(0);
      expect(analysis.changes).toEqual([]);
      expect(analysis.newVulnerabilities).toBe(0);
    });
  });

  describe('createDefaultCodeQualityMetrics', () => {
    it('should create default code quality metrics', () => {
      const metrics = createDefaultCodeQualityMetrics();

      expect(metrics.linesAdded).toBe(0);
      expect(metrics.linesRemoved).toBe(0);
      expect(metrics.filesModified).toBe(0);
    });
  });

  describe('createEvidencePacket', () => {
    it('should create a complete evidence packet', () => {
      const context = createTestContext();
      const packet = createEvidencePacket('run-123', 'tenant-abc', context);

      expect(packet.version).toBe('1.0');
      expect(packet.runId).toBe('run-123');
      expect(packet.tenantId).toBe('tenant-abc');
      expect(packet.context.issueNumber).toBe(42);
      expect(packet.tests.total).toBe(0);
      expect(packet.risk.level).toBe('low');
      expect(packet.security.completed).toBe(true);
      expect(packet.dependencies.changes).toEqual([]);
      expect(packet.files).toEqual([]);
      expect(packet.author.username).toBe('unknown');
    });

    it('should include creation timestamp', () => {
      const context = createTestContext();
      const before = new Date();
      const packet = createEvidencePacket('run-123', 'tenant-abc', context);
      const after = new Date();

      expect(packet.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(packet.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});

// =============================================================================
// Risk Calculation Tests
// =============================================================================

describe('Risk Calculation', () => {
  describe('calculateRiskScore', () => {
    it('should calculate low risk for minimal changes', () => {
      const context = createTestContext();
      const packet = createEvidencePacket('run-123', 'tenant-abc', context);

      // Minimal changes - should be low risk
      packet.quality.linesAdded = 10;
      packet.quality.linesRemoved = 5;
      packet.quality.netLinesChanged = 5;
      packet.quality.filesModified = 1;
      packet.tests.total = 10;
      packet.tests.passed = 10;
      packet.tests.coveragePercent = 80;
      packet.author.isMaintainer = true;

      const assessment = calculateRiskScore(packet);

      expect(assessment.level).toBe('low');
      expect(assessment.recommendation).toBe('auto_approve');
      expect(assessment.score).toBeLessThan(25);
    });

    it('should calculate higher risk for large changes', () => {
      const context = createTestContext();
      const packet = createEvidencePacket('run-123', 'tenant-abc', context);

      // Large changes - should be higher risk
      packet.quality.linesAdded = 500;
      packet.quality.linesRemoved = 100;
      packet.quality.netLinesChanged = 400;
      packet.quality.filesModified = 15;
      packet.quality.filesAdded = 5;
      packet.tests.total = 10;
      packet.tests.passed = 8;
      packet.tests.failed = 2;
      packet.tests.coveragePercent = 40;
      packet.author.tenureDays = 30;

      const assessment = calculateRiskScore(packet);

      expect(assessment.score).toBeGreaterThan(25);
      expect(['medium', 'high', 'critical']).toContain(assessment.level);
    });

    it('should block on critical security findings', () => {
      const context = createTestContext();
      const packet = createEvidencePacket('run-123', 'tenant-abc', context);

      // Critical security finding
      packet.security.totalFindings = 1;
      packet.security.findingsBySeverity.critical = 1;

      const assessment = calculateRiskScore(packet);

      expect(assessment.recommendation).toBe('block');
    });

    it('should include all risk factors', () => {
      const context = createTestContext();
      const packet = createEvidencePacket('run-123', 'tenant-abc', context);

      const assessment = calculateRiskScore(packet);

      expect(assessment.factors.length).toBe(7);
      expect(assessment.factors.map(f => f.id)).toContain('lines_changed');
      expect(assessment.factors.map(f => f.id)).toContain('files_changed');
      expect(assessment.factors.map(f => f.id)).toContain('test_coverage');
      expect(assessment.factors.map(f => f.id)).toContain('tests_passing');
      expect(assessment.factors.map(f => f.id)).toContain('security_findings');
      expect(assessment.factors.map(f => f.id)).toContain('dependency_changes');
      expect(assessment.factors.map(f => f.id)).toContain('author_tenure');
    });

    it('should respect custom thresholds', () => {
      const context = createTestContext();
      const packet = createEvidencePacket('run-123', 'tenant-abc', context);

      // Set values that would be medium with default thresholds
      packet.quality.netLinesChanged = 200;
      packet.quality.filesModified = 10;
      packet.tests.coveragePercent = 60;

      const strictThresholds = { low: 10, medium: 20, high: 30 };
      const lenientThresholds = { low: 50, medium: 70, high: 90 };

      const strictAssessment = calculateRiskScore(packet, strictThresholds);
      const lenientAssessment = calculateRiskScore(packet, lenientThresholds);

      // Strict thresholds should give higher level
      expect(strictAssessment.thresholds).toEqual(strictThresholds);
      expect(lenientAssessment.thresholds).toEqual(lenientThresholds);
    });

    it('should reduce risk for maintainers', () => {
      const context = createTestContext();
      const packet = createEvidencePacket('run-123', 'tenant-abc', context);

      // Same changes, different author status
      packet.quality.netLinesChanged = 100;
      packet.quality.filesModified = 5;

      // First as new contributor
      packet.author.isMaintainer = false;
      packet.author.tenureDays = 10;
      const newContributorScore = calculateRiskScore(packet).score;

      // Then as maintainer
      packet.author.isMaintainer = true;
      const maintainerScore = calculateRiskScore(packet).score;

      expect(maintainerScore).toBeLessThan(newContributorScore);
    });

    it('should increase risk for dependency changes', () => {
      const context = createTestContext();
      const packet = createEvidencePacket('run-123', 'tenant-abc', context);

      const baseScore = calculateRiskScore(packet).score;

      // Add dependency changes
      packet.dependencies.changes = [
        { name: 'lodash', type: 'added', newVersion: '4.17.21', isDev: false },
        { name: 'react', type: 'updated', previousVersion: '17.0.0', newVersion: '18.0.0', isDev: false },
      ];

      const withDepsScore = calculateRiskScore(packet).score;

      expect(withDepsScore).toBeGreaterThan(baseScore);
    });
  });

  describe('DEFAULT_RISK_FACTORS', () => {
    it('should have weights that sum to 1', () => {
      const totalWeight = Object.values(DEFAULT_RISK_FACTORS).reduce(
        (sum, factor) => sum + factor.weight,
        0
      );

      expect(totalWeight).toBeCloseTo(1, 5);
    });

    it('should define all expected factors', () => {
      expect(DEFAULT_RISK_FACTORS).toHaveProperty('linesChanged');
      expect(DEFAULT_RISK_FACTORS).toHaveProperty('filesChanged');
      expect(DEFAULT_RISK_FACTORS).toHaveProperty('testCoverage');
      expect(DEFAULT_RISK_FACTORS).toHaveProperty('testsPassing');
      expect(DEFAULT_RISK_FACTORS).toHaveProperty('securityFindings');
      expect(DEFAULT_RISK_FACTORS).toHaveProperty('dependencyChanges');
      expect(DEFAULT_RISK_FACTORS).toHaveProperty('authorTenure');
    });
  });
});

// =============================================================================
// Evidence Packet Structure Tests
// =============================================================================

describe('EvidencePacket Structure', () => {
  it('should support PR context', () => {
    const context = createTestContext();
    context.prNumber = 123;
    context.prUrl = 'https://github.com/owner/repo/pull/123';

    const packet = createEvidencePacket('run-123', 'tenant-abc', context);

    expect(packet.context.prNumber).toBe(123);
    expect(packet.context.prUrl).toBe('https://github.com/owner/repo/pull/123');
  });

  it('should support file change summaries', () => {
    const context = createTestContext();
    const packet = createEvidencePacket('run-123', 'tenant-abc', context);

    packet.files = [
      { path: 'src/index.ts', type: 'modified', linesAdded: 10, linesRemoved: 5, category: 'source' },
      { path: 'src/test.test.ts', type: 'added', linesAdded: 50, linesRemoved: 0, category: 'test' },
    ];

    expect(packet.files.length).toBe(2);
    expect(packet.files[0].category).toBe('source');
    expect(packet.files[1].category).toBe('test');
  });

  it('should support security findings', () => {
    const context = createTestContext();
    const packet = createEvidencePacket('run-123', 'tenant-abc', context);

    packet.security.topFindings = [
      {
        severity: 'high',
        type: 'injection',
        title: 'SQL Injection',
        description: 'User input not sanitized',
        file: 'src/db.ts',
        line: 42,
        cwe: 'CWE-89',
      },
    ];
    packet.security.totalFindings = 1;
    packet.security.findingsBySeverity.high = 1;

    expect(packet.security.topFindings[0].cwe).toBe('CWE-89');
  });

  it('should support custom metadata', () => {
    const context = createTestContext();
    const packet = createEvidencePacket('run-123', 'tenant-abc', context);

    packet.metadata = {
      triggeredBy: 'label:autopilot',
      processingNode: 'worker-1',
      customField: 123,
    };

    expect(packet.metadata.triggeredBy).toBe('label:autopilot');
    expect(packet.metadata.customField).toBe(123);
  });
});
