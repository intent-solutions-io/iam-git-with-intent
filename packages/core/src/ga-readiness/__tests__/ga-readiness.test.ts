/**
 * Tests for Phase 70: GA Readiness Gate
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GaReadinessService,
  createGaReadinessService,
  createDefaultGaReadinessService,
  GA_READINESS_VERSION,
  GaReadinessCheckCategory,
  GaReadinessStatus,
  ReadinessSeverity,
  GaReadinessErrorCodes,
  DEFAULT_GA_CHECKS,
  validateGaReadinessCheck,
  validateReadinessMilestone,
  validateReadinessGate,
  validateGaReadinessReport,
  type GaReadinessCheck,
  type ReadinessMilestone,
  type ReadinessGate,
  type GaReadinessReport,
} from '../index.js';

describe('GA Readiness Gate', () => {
  let service: GaReadinessService;

  beforeEach(() => {
    service = createGaReadinessService();
  });

  describe('Module exports', () => {
    it('should export version constant', () => {
      expect(GA_READINESS_VERSION).toBe('1.0.0');
    });

    it('should export GaReadinessCheckCategory enum', () => {
      const categories = GaReadinessCheckCategory.options;
      expect(categories).toContain('feature');
      expect(categories).toContain('performance');
      expect(categories).toContain('security');
      expect(categories).toContain('documentation');
      expect(categories).toContain('compliance');
      expect(categories).toContain('operational');
      expect(categories).toContain('integration');
      expect(categories).toContain('testing');
    });

    it('should export GaReadinessStatus enum', () => {
      const statuses = GaReadinessStatus.options;
      expect(statuses).toContain('not_started');
      expect(statuses).toContain('in_progress');
      expect(statuses).toContain('passed');
      expect(statuses).toContain('failed');
      expect(statuses).toContain('blocked');
      expect(statuses).toContain('waived');
    });

    it('should export ReadinessSeverity enum', () => {
      const severities = ReadinessSeverity.options;
      expect(severities).toContain('critical');
      expect(severities).toContain('high');
      expect(severities).toContain('medium');
      expect(severities).toContain('low');
    });

    it('should export error codes', () => {
      expect(GaReadinessErrorCodes.CHECK_NOT_FOUND).toBe('GA_CHECK_NOT_FOUND');
      expect(GaReadinessErrorCodes.MILESTONE_NOT_FOUND).toBe('GA_MILESTONE_NOT_FOUND');
      expect(GaReadinessErrorCodes.GATE_NOT_FOUND).toBe('GA_GATE_NOT_FOUND');
      expect(GaReadinessErrorCodes.CHECK_BLOCKED).toBe('GA_CHECK_BLOCKED');
    });

    it('should export DEFAULT_GA_CHECKS', () => {
      expect(Array.isArray(DEFAULT_GA_CHECKS)).toBe(true);
      expect(DEFAULT_GA_CHECKS.length).toBeGreaterThan(0);

      // Check structure of default checks
      for (const check of DEFAULT_GA_CHECKS) {
        expect(check).toHaveProperty('id');
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('description');
        expect(check).toHaveProperty('category');
        expect(check).toHaveProperty('severity');
        expect(check).toHaveProperty('automated');
      }
    });

    it('should export factory functions', () => {
      expect(typeof createGaReadinessService).toBe('function');
      expect(typeof createDefaultGaReadinessService).toBe('function');

      const basic = createGaReadinessService();
      const withDefaults = createDefaultGaReadinessService();

      expect(basic).toBeInstanceOf(GaReadinessService);
      expect(withDefaults).toBeInstanceOf(GaReadinessService);
    });

    it('should initialize default checks with createDefaultGaReadinessService', () => {
      const serviceWithDefaults = createDefaultGaReadinessService();
      const stats = serviceWithDefaults.getStats();

      expect(stats.totalChecks).toBe(DEFAULT_GA_CHECKS.length);
    });
  });

  describe('Check Management', () => {
    it('should create a readiness check', () => {
      const check = service.createCheck({
        name: 'API Documentation',
        description: 'Complete API documentation with examples',
        category: 'documentation',
        severity: 'high',
        automated: false,
      });

      expect(check).toBeDefined();
      expect(check.id).toBeDefined();
      expect(check.name).toBe('API Documentation');
      expect(check.category).toBe('documentation');
      expect(check.severity).toBe('high');
      expect(check.status).toBe('not_started');
    });

    it('should create check with custom ID', () => {
      const check = service.createCheck({
        id: 'custom-check-id',
        name: 'Custom Check',
        description: 'Check with custom ID',
        category: 'feature',
        severity: 'medium',
        automated: false,
      });

      expect(check.id).toBe('custom-check-id');
    });

    it('should throw error for duplicate check ID', () => {
      service.createCheck({
        id: 'duplicate-id',
        name: 'First Check',
        description: 'First',
        category: 'feature',
        severity: 'low',
        automated: false,
      });

      expect(() => {
        service.createCheck({
          id: 'duplicate-id',
          name: 'Second Check',
          description: 'Second',
          category: 'feature',
          severity: 'low',
          automated: false,
        });
      }).toThrow(GaReadinessErrorCodes.CHECK_ALREADY_EXISTS);
    });

    it('should get check by ID', () => {
      const created = service.createCheck({
        name: 'Test Check',
        description: 'Test',
        category: 'testing',
        severity: 'medium',
        automated: false,
      });

      const retrieved = service.getCheck(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should return undefined for nonexistent check', () => {
      const check = service.getCheck('nonexistent');
      expect(check).toBeUndefined();
    });

    it('should update check status', () => {
      const check = service.createCheck({
        name: 'Status Update Test',
        description: 'Test status update',
        category: 'feature',
        severity: 'high',
        automated: false,
      });

      const updated = service.updateCheckStatus(check.id, 'passed', {
        passed: true,
        message: 'All requirements met',
      });

      expect(updated.status).toBe('passed');
      expect(updated.lastResult?.passed).toBe(true);
      expect(updated.lastResult?.message).toBe('All requirements met');
    });

    it('should throw error updating nonexistent check', () => {
      expect(() => {
        service.updateCheckStatus('nonexistent', 'passed');
      }).toThrow(GaReadinessErrorCodes.CHECK_NOT_FOUND);
    });

    it('should list checks by category', () => {
      service.createCheck({
        name: 'Security Check 1',
        description: 'First security',
        category: 'security',
        severity: 'critical',
        automated: false,
      });
      service.createCheck({
        name: 'Security Check 2',
        description: 'Second security',
        category: 'security',
        severity: 'high',
        automated: false,
      });
      service.createCheck({
        name: 'Feature Check',
        description: 'Feature',
        category: 'feature',
        severity: 'medium',
        automated: false,
      });

      const securityChecks = service.listChecks({ category: 'security' });
      expect(securityChecks).toHaveLength(2);
      expect(securityChecks.every(c => c.category === 'security')).toBe(true);
    });

    it('should list checks by status', () => {
      const check1 = service.createCheck({
        name: 'Passed Check',
        description: 'Will pass',
        category: 'feature',
        severity: 'low',
        automated: false,
      });
      service.createCheck({
        name: 'Pending Check',
        description: 'Not started',
        category: 'feature',
        severity: 'low',
        automated: false,
      });

      service.updateCheckStatus(check1.id, 'passed');

      const passedChecks = service.listChecks({ status: 'passed' });
      expect(passedChecks).toHaveLength(1);
      expect(passedChecks[0].id).toBe(check1.id);
    });

    it('should list checks by severity', () => {
      service.createCheck({
        name: 'Critical Check',
        description: 'Critical severity',
        category: 'security',
        severity: 'critical',
        automated: false,
      });
      service.createCheck({
        name: 'Low Check',
        description: 'Low severity',
        category: 'feature',
        severity: 'low',
        automated: false,
      });

      const criticalChecks = service.listChecks({ severity: 'critical' });
      expect(criticalChecks).toHaveLength(1);
      expect(criticalChecks[0].severity).toBe('critical');
    });
  });

  describe('Check Waivers', () => {
    it('should waive a check', () => {
      const check = service.createCheck({
        name: 'Waivable Check',
        description: 'Can be waived',
        category: 'documentation',
        severity: 'low',
        automated: false,
      });

      const waived = service.waiveCheck(
        check.id,
        'admin@example.com',
        'Not applicable for initial release'
      );

      expect(waived.status).toBe('waived');
      expect(waived.waivedBy).toBe('admin@example.com');
      expect(waived.waivedReason).toBe('Not applicable for initial release');
      expect(waived.waivedAt).toBeDefined();
    });

    it('should throw error waiving nonexistent check', () => {
      expect(() => {
        service.waiveCheck('nonexistent', 'admin', 'reason');
      }).toThrow(GaReadinessErrorCodes.CHECK_NOT_FOUND);
    });

    it('should respect max waivers per category', () => {
      // Create 3 checks in same category
      const check1 = service.createCheck({
        name: 'Check 1',
        description: 'First',
        category: 'documentation',
        severity: 'low',
        automated: false,
      });
      const check2 = service.createCheck({
        name: 'Check 2',
        description: 'Second',
        category: 'documentation',
        severity: 'low',
        automated: false,
      });
      const check3 = service.createCheck({
        name: 'Check 3',
        description: 'Third',
        category: 'documentation',
        severity: 'low',
        automated: false,
      });

      // Waive first two (default max is 2)
      service.waiveCheck(check1.id, 'admin', 'reason 1');
      service.waiveCheck(check2.id, 'admin', 'reason 2');

      // Third should fail
      expect(() => {
        service.waiveCheck(check3.id, 'admin', 'reason 3');
      }).toThrow(GaReadinessErrorCodes.INVALID_WAIVER);
    });

    it('should not allow waivers when disabled', () => {
      const noWaiverService = createGaReadinessService({ allowWaivers: false });

      const check = noWaiverService.createCheck({
        name: 'No Waiver Check',
        description: 'Cannot be waived',
        category: 'security',
        severity: 'critical',
        automated: false,
      });

      expect(() => {
        noWaiverService.waiveCheck(check.id, 'admin', 'reason');
      }).toThrow(GaReadinessErrorCodes.INVALID_WAIVER);
    });
  });

  describe('Automated Checks', () => {
    it('should register automated check handler', () => {
      const check = service.createCheck({
        id: 'auto-check',
        name: 'Automated Check',
        description: 'Runs automatically',
        category: 'testing',
        severity: 'high',
        automated: true,
      });

      service.registerAutomatedCheck('auto-check', async () => ({
        passed: true,
        message: 'All tests pass',
        details: { testsRun: 100, testsPassed: 100 },
      }));

      expect(check.automated).toBe(true);
    });

    it('should run automated check', async () => {
      service.createCheck({
        id: 'run-auto',
        name: 'Run Auto Check',
        description: 'Will be run',
        category: 'testing',
        severity: 'medium',
        automated: true,
      });

      service.registerAutomatedCheck('run-auto', async () => ({
        passed: true,
        message: 'Check passed',
      }));

      const result = await service.runAutomatedCheck('run-auto');

      expect(result.status).toBe('passed');
      expect(result.lastResult?.passed).toBe(true);
      expect(result.lastResult?.duration).toBeDefined();
    });

    it('should handle failing automated check', async () => {
      service.createCheck({
        id: 'fail-auto',
        name: 'Failing Auto Check',
        description: 'Will fail',
        category: 'testing',
        severity: 'medium',
        automated: true,
      });

      service.registerAutomatedCheck('fail-auto', async () => ({
        passed: false,
        message: 'Tests failed',
        details: { testsFailed: 5 },
      }));

      const result = await service.runAutomatedCheck('fail-auto');

      expect(result.status).toBe('failed');
      expect(result.lastResult?.passed).toBe(false);
    });

    it('should throw error for non-automated check', async () => {
      service.createCheck({
        id: 'manual-check',
        name: 'Manual Check',
        description: 'Not automated',
        category: 'feature',
        severity: 'low',
        automated: false,
      });

      await expect(service.runAutomatedCheck('manual-check')).rejects.toThrow(
        GaReadinessErrorCodes.AUTOMATED_CHECK_FAILED
      );
    });

    it('should run all automated checks', async () => {
      service.createCheck({
        id: 'auto-1',
        name: 'Auto 1',
        description: 'First auto',
        category: 'testing',
        severity: 'medium',
        automated: true,
      });
      service.createCheck({
        id: 'auto-2',
        name: 'Auto 2',
        description: 'Second auto',
        category: 'testing',
        severity: 'medium',
        automated: true,
      });

      service.registerAutomatedCheck('auto-1', async () => ({ passed: true, message: 'OK' }));
      service.registerAutomatedCheck('auto-2', async () => ({ passed: true, message: 'OK' }));

      const results = await service.runAllAutomatedChecks();

      expect(results.size).toBe(2);
      expect(results.get('auto-1')?.status).toBe('passed');
      expect(results.get('auto-2')?.status).toBe('passed');
    });
  });

  describe('Milestones', () => {
    it('should create a milestone', () => {
      const check1 = service.createCheck({
        id: 'ms-check-1',
        name: 'Check 1',
        description: 'First',
        category: 'feature',
        severity: 'high',
        automated: false,
      });
      const check2 = service.createCheck({
        id: 'ms-check-2',
        name: 'Check 2',
        description: 'Second',
        category: 'feature',
        severity: 'medium',
        automated: false,
      });

      const milestone = service.createMilestone({
        name: 'Alpha Release',
        description: 'Ready for alpha testing',
        targetDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        checkIds: [check1.id, check2.id],
      });

      expect(milestone).toBeDefined();
      expect(milestone.id).toBeDefined();
      expect(milestone.name).toBe('Alpha Release');
      expect(milestone.checkIds).toHaveLength(2);
      expect(milestone.status).toBe('not_started');
    });

    it('should get milestone by ID', () => {
      const created = service.createMilestone({
        name: 'Test Milestone',
        description: 'Test',
        targetDate: new Date(),
        checkIds: [],
      });

      const retrieved = service.getMilestone(created.id);
      expect(retrieved).toEqual(created);
    });

    it('should get milestone status with progress', () => {
      const check1 = service.createCheck({
        id: 'prog-check-1',
        name: 'Progress 1',
        description: 'First',
        category: 'feature',
        severity: 'medium',
        automated: false,
      });
      const check2 = service.createCheck({
        id: 'prog-check-2',
        name: 'Progress 2',
        description: 'Second',
        category: 'feature',
        severity: 'medium',
        automated: false,
      });

      const milestone = service.createMilestone({
        name: 'Progress Milestone',
        description: 'Track progress',
        targetDate: new Date(),
        checkIds: [check1.id, check2.id],
      });

      // Mark one as passed
      service.updateCheckStatus(check1.id, 'passed');

      const status = service.getMilestoneStatus(milestone.id);

      expect(status.progress).toBe(50); // 1 of 2 passed
      expect(status.checks).toHaveLength(2);
    });
  });

  describe('Gates', () => {
    it('should create a gate', () => {
      const gate = service.createGate({
        name: 'GA Release Gate',
        description: 'Requirements for general availability',
        version: '1.0.0',
        targetLaunchDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        milestones: [],
        requiredCategories: ['feature', 'security', 'testing'],
        blockingChecks: [],
        launchApprovalRequired: true,
      });

      expect(gate).toBeDefined();
      expect(gate.id).toBeDefined();
      expect(gate.name).toBe('GA Release Gate');
      expect(gate.status).toBe('not_started');
      expect(gate.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should get gate by ID', () => {
      const created = service.createGate({
        name: 'Test Gate',
        description: 'Test',
        version: '1.0.0',
        milestones: [],
        requiredCategories: ['feature'],
        blockingChecks: [],
        launchApprovalRequired: false,
      });

      const retrieved = service.getGate(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should calculate gate scores', () => {
      // Create checks in different categories
      const featureCheck = service.createCheck({
        name: 'Feature Complete',
        description: 'All features done',
        category: 'feature',
        severity: 'high',
        automated: false,
      });
      const securityCheck = service.createCheck({
        name: 'Security Audit',
        description: 'Audit passed',
        category: 'security',
        severity: 'critical',
        automated: false,
      });

      const gate = service.createGate({
        name: 'Score Gate',
        description: 'Testing scores',
        version: '1.0.0',
        milestones: [],
        requiredCategories: ['feature', 'security'],
        blockingChecks: [],
        launchApprovalRequired: false,
      });

      // Pass one check
      service.updateCheckStatus(featureCheck.id, 'passed');

      const updatedGate = service.getGate(gate.id);
      expect(updatedGate!.overallScore).toBeGreaterThan(0);
    });

    it('should approve launch', () => {
      // Create and pass required checks
      const check = service.createCheck({
        name: 'Required Check',
        description: 'Must pass',
        category: 'feature',
        severity: 'high',
        automated: false,
      });
      service.updateCheckStatus(check.id, 'passed');

      const gate = service.createGate({
        name: 'Approval Gate',
        description: 'Test approval',
        version: '1.0.0',
        milestones: [],
        requiredCategories: ['feature'],
        blockingChecks: [],
        launchApprovalRequired: true,
      });

      const approved = service.approveLaunch(
        gate.id,
        'cto@example.com',
        'All requirements met, ready to ship'
      );

      expect(approved.launchApprovedBy).toBe('cto@example.com');
      expect(approved.launchApprovedAt).toBeDefined();
      expect(approved.launchNotes).toBe('All requirements met, ready to ship');
    });

    it('should not approve blocked gate', () => {
      const blockedGate = service.createGate({
        name: 'Blocked Gate',
        description: 'Cannot approve',
        version: '1.0.0',
        milestones: [],
        requiredCategories: [],
        blockingChecks: [],
        launchApprovalRequired: false,
      });

      // Force block status by creating a failing critical check
      const criticalCheck = service.createCheck({
        name: 'Critical Blocker',
        description: 'Blocks release',
        category: 'security',
        severity: 'critical',
        automated: false,
      });
      service.updateCheckStatus(criticalCheck.id, 'failed');

      // Update gate to include security category
      const gateWithSecurity = service.createGate({
        name: 'Blocked Security Gate',
        description: 'Has blocking check',
        version: '1.0.0',
        milestones: [],
        requiredCategories: ['security'],
        blockingChecks: [criticalCheck.id],
        launchApprovalRequired: true,
      });

      expect(() => {
        service.approveLaunch(gateWithSecurity.id, 'admin', 'Trying to approve');
      }).toThrow();
    });
  });

  describe('Reports', () => {
    it('should generate readiness report', () => {
      // Setup some checks
      const check1 = service.createCheck({
        name: 'Report Check 1',
        description: 'First',
        category: 'feature',
        severity: 'high',
        automated: false,
      });
      const check2 = service.createCheck({
        name: 'Report Check 2',
        description: 'Second',
        category: 'security',
        severity: 'critical',
        automated: false,
      });

      service.updateCheckStatus(check1.id, 'passed');
      service.updateCheckStatus(check2.id, 'failed', {
        passed: false,
        message: 'Security vulnerability found',
      });

      const gate = service.createGate({
        name: 'Report Gate',
        description: 'For reporting',
        version: '1.0.0',
        milestones: [],
        requiredCategories: ['feature', 'security'],
        blockingChecks: [],
        launchApprovalRequired: false,
      });

      const report = service.generateReport(gate.id);

      expect(report).toBeDefined();
      expect(report.id).toBeDefined();
      expect(report.gateId).toBe(gate.id);
      expect(report.summary).toBeDefined();
      expect(report.summary.totalChecks).toBeGreaterThan(0);
      expect(report.summary.passedChecks).toBeGreaterThanOrEqual(1);
      expect(report.summary.failedChecks).toBeGreaterThanOrEqual(1);
      expect(report.categoryBreakdown).toBeDefined();
      expect(report.blockingIssues).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.riskAssessment).toBeDefined();
    });

    it('should include blocking issues in report', () => {
      const criticalCheck = service.createCheck({
        name: 'Critical Failure',
        description: 'Critical issue',
        category: 'security',
        severity: 'critical',
        automated: false,
      });
      service.updateCheckStatus(criticalCheck.id, 'failed', {
        passed: false,
        message: 'Critical security flaw detected',
      });

      const gate = service.createGate({
        name: 'Blocking Issues Gate',
        description: 'Has blockers',
        version: '1.0.0',
        milestones: [],
        requiredCategories: ['security'],
        blockingChecks: [criticalCheck.id],
        launchApprovalRequired: false,
      });

      const report = service.generateReport(gate.id);

      expect(report.blockingIssues.length).toBeGreaterThan(0);
      expect(report.blockingIssues[0].checkId).toBe(criticalCheck.id);
      expect(report.blockingIssues[0].severity).toBe('critical');
    });

    it('should assess risk level', () => {
      const criticalCheck = service.createCheck({
        name: 'Risk Check',
        description: 'Affects risk',
        category: 'security',
        severity: 'critical',
        automated: false,
      });
      service.updateCheckStatus(criticalCheck.id, 'failed');

      const gate = service.createGate({
        name: 'Risk Gate',
        description: 'Risk assessment',
        version: '1.0.0',
        milestones: [],
        requiredCategories: ['security'],
        blockingChecks: [],
        launchApprovalRequired: false,
      });

      const report = service.generateReport(gate.id);

      expect(report.riskAssessment.level).toBe('critical');
      expect(report.riskAssessment.factors.length).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should get check statistics', () => {
      service.createCheck({
        name: 'Stat Check 1',
        description: 'For stats',
        category: 'feature',
        severity: 'high',
        automated: false,
      });
      service.createCheck({
        name: 'Stat Check 2',
        description: 'For stats',
        category: 'security',
        severity: 'critical',
        automated: true,
      });

      const stats = service.getStats();

      expect(stats.totalChecks).toBe(2);
      expect(stats.byStatus).toBeDefined();
      expect(stats.byCategory).toBeDefined();
      expect(stats.bySeverity).toBeDefined();
      expect(stats.byStatus.not_started).toBe(2);
      expect(stats.byCategory.feature).toBe(1);
      expect(stats.byCategory.security).toBe(1);
      expect(stats.bySeverity.high).toBe(1);
      expect(stats.bySeverity.critical).toBe(1);
    });
  });

  describe('Validation Functions', () => {
    it('should validate readiness check', () => {
      const validCheck = {
        id: 'valid-check',
        name: 'Valid Check',
        description: 'A valid check',
        category: 'feature',
        severity: 'high',
        status: 'not_started',
        automated: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = validateGaReadinessCheck(validCheck);
      expect(result.id).toBe('valid-check');
    });

    it('should throw on invalid check', () => {
      expect(() => {
        validateGaReadinessCheck({ invalid: 'data' });
      }).toThrow();
    });

    it('should validate milestone', () => {
      const validMilestone = {
        id: 'valid-milestone',
        name: 'Valid Milestone',
        description: 'A valid milestone',
        targetDate: new Date(),
        checkIds: ['check-1', 'check-2'],
        status: 'not_started',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = validateReadinessMilestone(validMilestone);
      expect(result.id).toBe('valid-milestone');
    });
  });
});
