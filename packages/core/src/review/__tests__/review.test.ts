/**
 * PR Review Service Tests
 *
 * Phase 37: Tests for automated PR review.
 */

import { describe, it, expect } from 'vitest';
import {
  PRReviewService,
  DEFAULT_AUTO_APPROVE_CONFIG,
  DEFAULT_COMMENT_CONFIG,
  logReviewDecision,
  type AutoApproveConfig,
} from '../index.js';
import {
  createEvidencePacket,
  type EvidencePacket,
} from '../../evidence/index.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createTestContext = (): EvidencePacket['context'] => ({
  issueNumber: 42,
  issueUrl: 'https://github.com/owner/repo/issues/42',
  prNumber: 123,
  prUrl: 'https://github.com/owner/repo/pull/123',
  repo: 'owner/repo',
  baseBranch: 'main',
  targetBranch: 'feature/test',
});

const createLowRiskPacket = (): EvidencePacket => {
  const packet = createEvidencePacket('run-123', 'tenant-abc', createTestContext());

  // Low risk settings
  packet.quality.linesAdded = 20;
  packet.quality.linesRemoved = 5;
  packet.quality.netLinesChanged = 15;
  packet.quality.filesModified = 2;
  packet.tests.total = 50;
  packet.tests.passed = 50;
  packet.tests.coveragePercent = 85;
  packet.author.isMaintainer = true;

  return packet;
};

const createHighRiskPacket = (): EvidencePacket => {
  const packet = createEvidencePacket('run-456', 'tenant-abc', createTestContext());

  // High risk settings
  packet.quality.linesAdded = 500;
  packet.quality.linesRemoved = 100;
  packet.quality.netLinesChanged = 400;
  packet.quality.filesModified = 15;
  packet.quality.filesAdded = 5;
  packet.tests.total = 50;
  packet.tests.passed = 45;
  packet.tests.failed = 5;
  packet.tests.coveragePercent = 40;
  packet.security.totalFindings = 2;
  packet.security.findingsBySeverity.high = 1;
  packet.security.findingsBySeverity.medium = 1;
  packet.author.tenureDays = 30;

  return packet;
};

// =============================================================================
// PRReviewService Tests
// =============================================================================

describe('PRReviewService', () => {
  describe('Constructor', () => {
    it('should create service with default config', () => {
      const service = new PRReviewService();
      expect(service).toBeDefined();
    });

    it('should accept custom auto-approve config', () => {
      const config: Partial<AutoApproveConfig> = {
        maxRiskScore: 10,
        maxLinesChanged: 100,
      };
      const service = new PRReviewService(config);
      expect(service).toBeDefined();
    });

    it('should accept custom comment config', () => {
      const service = new PRReviewService({}, {
        includeRiskSummary: false,
        headerText: '## Custom Header',
      });
      expect(service).toBeDefined();
    });
  });

  describe('analyzeForReview', () => {
    it('should auto-approve low-risk changes', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();

      const decision = service.analyzeForReview(packet);

      expect(decision.decision).toBe('approve');
      expect(decision.autoApproved).toBe(true);
      expect(decision.reviewer).toBe('gwi-bot');
    });

    it('should request review for high-risk changes', () => {
      const service = new PRReviewService();
      const packet = createHighRiskPacket();

      const decision = service.analyzeForReview(packet);

      expect(decision.decision).not.toBe('approve');
      expect(decision.autoApproved).toBe(false);
    });

    it('should block on critical security findings', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();
      packet.security.totalFindings = 1;
      packet.security.findingsBySeverity.critical = 1;

      const decision = service.analyzeForReview(packet);

      expect(decision.decision).toBe('request_changes');
      expect(decision.reason).toContain('security');
    });

    it('should check all conditions', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();

      const decision = service.analyzeForReview(packet);

      expect(decision.conditions.length).toBeGreaterThan(0);
      expect(decision.conditions.map(c => c.id)).toContain('risk_score');
      expect(decision.conditions.map(c => c.id)).toContain('tests_passing');
      expect(decision.conditions.map(c => c.id)).toContain('no_security_findings');
    });

    it('should include risk assessment', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();

      const decision = service.analyzeForReview(packet);

      expect(decision.risk).toBeDefined();
      expect(decision.risk.score).toBeDefined();
      expect(decision.risk.level).toBeDefined();
      expect(decision.risk.factors).toBeDefined();
    });
  });

  describe('Auto-Approve Conditions', () => {
    it('should fail if risk score exceeds threshold', () => {
      const service = new PRReviewService({ maxRiskScore: 5 });
      const packet = createLowRiskPacket();
      packet.quality.netLinesChanged = 100; // Increase risk

      const decision = service.analyzeForReview(packet);
      const riskCondition = decision.conditions.find(c => c.id === 'risk_score');

      expect(riskCondition?.passed).toBe(false);
    });

    it('should fail if tests are failing', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();
      packet.tests.passed = 48;
      packet.tests.failed = 2;

      const decision = service.analyzeForReview(packet);
      const testCondition = decision.conditions.find(c => c.id === 'tests_passing');

      expect(testCondition?.passed).toBe(false);
    });

    it('should fail if coverage is below threshold', () => {
      const service = new PRReviewService({ minCoveragePercent: 80 });
      const packet = createLowRiskPacket();
      packet.tests.coveragePercent = 60;

      const decision = service.analyzeForReview(packet);
      const coverageCondition = decision.conditions.find(c => c.id === 'coverage_threshold');

      expect(coverageCondition?.passed).toBe(false);
    });

    it('should fail if lines changed exceeds limit', () => {
      const service = new PRReviewService({ maxLinesChanged: 50 });
      const packet = createLowRiskPacket();
      packet.quality.netLinesChanged = 100;

      const decision = service.analyzeForReview(packet);
      const linesCondition = decision.conditions.find(c => c.id === 'lines_changed');

      expect(linesCondition?.passed).toBe(false);
    });

    it('should fail if files changed exceeds limit', () => {
      const service = new PRReviewService({ maxFilesChanged: 5 });
      const packet = createLowRiskPacket();
      packet.quality.filesModified = 10;

      const decision = service.analyzeForReview(packet);
      const filesCondition = decision.conditions.find(c => c.id === 'files_changed');

      expect(filesCondition?.passed).toBe(false);
    });

    it('should fail if maintainers-only and author is not maintainer', () => {
      const service = new PRReviewService({ maintainersOnly: true });
      const packet = createLowRiskPacket();
      packet.author.isMaintainer = false;

      const decision = service.analyzeForReview(packet);
      const maintainerCondition = decision.conditions.find(c => c.id === 'maintainer_only');

      expect(maintainerCondition?.passed).toBe(false);
    });

    it('should fail if excluded files are touched', () => {
      // Use default config which includes package.json in excluded patterns
      const service = new PRReviewService();
      const packet = createLowRiskPacket();
      packet.files = [
        { path: 'src/package.json', type: 'modified', linesAdded: 1, linesRemoved: 1, category: 'config' },
      ];

      const decision = service.analyzeForReview(packet);
      const excludedCondition = decision.conditions.find(c => c.id === 'excluded_files');

      expect(excludedCondition?.passed).toBe(false);
    });
  });

  describe('generateComment', () => {
    it('should generate markdown comment', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();
      const decision = service.analyzeForReview(packet);

      const comment = service.generateComment(packet, decision);

      expect(comment.body).toContain('## 🤖 Autopilot Review');
      expect(comment.body).toContain('Risk Assessment');
      expect(comment.body).toContain('Test Results');
    });

    it('should include risk summary', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();
      const decision = service.analyzeForReview(packet);

      const comment = service.generateComment(packet, decision);

      expect(comment.body).toContain('Risk Level');
      expect(comment.body).toContain('Score:');
    });

    it('should include test results', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();
      packet.tests.coveragePercent = 85;
      const decision = service.analyzeForReview(packet);

      const comment = service.generateComment(packet, decision);

      expect(comment.body).toContain('50/50');
      expect(comment.body).toContain('85%');
    });

    it('should include security findings when present', () => {
      const service = new PRReviewService();
      const packet = createHighRiskPacket();
      packet.security.topFindings = [
        {
          severity: 'high',
          type: 'injection',
          title: 'SQL Injection',
          description: 'User input not sanitized',
          file: 'src/db.ts',
        },
      ];
      const decision = service.analyzeForReview(packet);

      const comment = service.generateComment(packet, decision);

      expect(comment.body).toContain('Security Findings');
      expect(comment.body).toContain('SQL Injection');
    });

    it('should include file changes', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();
      packet.files = [
        { path: 'src/index.ts', type: 'modified', linesAdded: 10, linesRemoved: 5, category: 'source' },
      ];
      const decision = service.analyzeForReview(packet);

      const comment = service.generateComment(packet, decision);

      expect(comment.body).toContain('File Changes');
      expect(comment.body).toContain('src/index.ts');
    });

    it('should include review conditions', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();
      const decision = service.analyzeForReview(packet);

      const comment = service.generateComment(packet, decision);

      expect(comment.body).toContain('Review Conditions');
    });

    it('should set correct review action for approval', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();
      const decision = service.analyzeForReview(packet);

      const comment = service.generateComment(packet, decision);

      expect(comment.isReview).toBe(true);
      expect(comment.reviewAction).toBe('APPROVE');
    });

    it('should set correct review action for request changes', () => {
      const service = new PRReviewService();
      const packet = createLowRiskPacket();
      packet.security.totalFindings = 1;
      packet.security.findingsBySeverity.critical = 1;
      const decision = service.analyzeForReview(packet);

      const comment = service.generateComment(packet, decision);

      expect(comment.reviewAction).toBe('REQUEST_CHANGES');
    });

    it('should include custom header and footer', () => {
      const service = new PRReviewService({}, {
        headerText: '## Custom Header',
        footerText: '_Custom Footer_',
      });
      const packet = createLowRiskPacket();
      const decision = service.analyzeForReview(packet);

      const comment = service.generateComment(packet, decision);

      expect(comment.body).toContain('## Custom Header');
      expect(comment.body).toContain('_Custom Footer_');
    });
  });

  describe('disabled auto-approve', () => {
    it('should not auto-approve when disabled', () => {
      const service = new PRReviewService({ enabled: false });
      const packet = createLowRiskPacket();

      const decision = service.analyzeForReview(packet);

      expect(decision.autoApproved).toBe(false);
      expect(decision.decision).toBe('comment');
    });
  });
});

// =============================================================================
// Audit Tests
// =============================================================================

describe('Review Audit', () => {
  it('should log review decision', () => {
    const service = new PRReviewService();
    const packet = createLowRiskPacket();
    const decision = service.analyzeForReview(packet);

    const entry = logReviewDecision(
      'run-123',
      'tenant-abc',
      123,
      'owner/repo',
      decision
    );

    expect(entry.id).toContain('review-run-123');
    expect(entry.runId).toBe('run-123');
    expect(entry.tenantId).toBe('tenant-abc');
    expect(entry.prNumber).toBe(123);
    expect(entry.repo).toBe('owner/repo');
    expect(entry.decision).toBe(decision);
    expect(entry.timestamp).toBeInstanceOf(Date);
  });
});

// =============================================================================
// Default Configuration Tests
// =============================================================================

describe('Default Configurations', () => {
  it('should have sensible auto-approve defaults', () => {
    expect(DEFAULT_AUTO_APPROVE_CONFIG.enabled).toBe(true);
    expect(DEFAULT_AUTO_APPROVE_CONFIG.maxRiskScore).toBe(25);
    expect(DEFAULT_AUTO_APPROVE_CONFIG.requirePassingTests).toBe(true);
    expect(DEFAULT_AUTO_APPROVE_CONFIG.requireNoSecurityFindings).toBe(true);
    expect(DEFAULT_AUTO_APPROVE_CONFIG.excludedPatterns).toContain('**/package.json');
  });

  it('should have sensible comment defaults', () => {
    expect(DEFAULT_COMMENT_CONFIG.includeRiskSummary).toBe(true);
    expect(DEFAULT_COMMENT_CONFIG.includeTestResults).toBe(true);
    expect(DEFAULT_COMMENT_CONFIG.includeSecurityFindings).toBe(true);
    expect(DEFAULT_COMMENT_CONFIG.headerText).toContain('Autopilot Review');
  });
});
