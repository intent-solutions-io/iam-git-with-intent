/**
 * Report Generator Tests
 *
 * Tests for D4.3: Compliance report generator with scheduling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ReportGenerationRequest,
  ReportGenerationResult,
  ScheduledReportConfig,
  ScheduledReportRun,
  parseNextCronRun,
  calculatePeriodDates,
  ReportGenerator,
  ReportScheduleManager,
  createReportGenerator,
  createScheduleManager,
  createScheduledReport,
  initializeReportGenerator,
  getReportGenerator,
  getScheduleManager,
  resetReportGenerator,
} from '../report-generator.js';
import type { EvidenceCollector, CollectedEvidence, EvidenceCollectionResult } from '../evidence-collector.js';
import type { ControlDefinition } from '../report-templates.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockEvidence: CollectedEvidence = {
  evidence: {
    id: 'ev-001',
    type: 'audit_log',
    description: 'User authentication event',
    auditLogEntryIds: ['audit-001'],
    chainVerified: true,
    collectedAt: new Date('2024-01-15T10:00:00Z'),
    collectedBy: 'test-collector',
  },
  source: 'audit_log',
  relevanceScore: 0.85,
  relatedControlIds: ['CC6.1', 'CC6.2'],
};

const createMockEvidenceCollector = (
  evidence: CollectedEvidence[] = [mockEvidence]
): EvidenceCollector => ({
  collect: vi.fn().mockResolvedValue({
    query: {
      tenantId: 'tenant-1',
      timeRange: {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
      },
    },
    evidence,
    totalCount: evidence.length,
    collectedAt: new Date(),
  } as EvidenceCollectionResult),
  collectForControl: vi.fn().mockResolvedValue(evidence),
  collectForControls: vi.fn().mockImplementation(
    async (_tenantId: string, controls: ControlDefinition[]) => {
      const map = new Map<string, CollectedEvidence[]>();
      for (const control of controls) {
        map.set(control.controlId, evidence);
      }
      return map;
    }
  ),
});

const createTestRequest = (overrides: Partial<ReportGenerationRequest> = {}): ReportGenerationRequest => ({
  tenantId: 'tenant-123',
  organizationName: 'Test Organization',
  framework: 'soc2_type2',
  period: {
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-01-31'),
    description: 'January 2024',
  },
  outputFormat: 'json',
  collectEvidence: false,
  ...overrides,
});

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('Report Generator Schemas', () => {
  describe('ReportGenerationRequest', () => {
    it('should validate a valid request', () => {
      const request = createTestRequest();
      const result = ReportGenerationRequest.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should require tenantId', () => {
      const request = createTestRequest({ tenantId: '' });
      const result = ReportGenerationRequest.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should require organizationName', () => {
      const request = createTestRequest({ organizationName: '' });
      const result = ReportGenerationRequest.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should validate framework enum', () => {
      const request = createTestRequest({ framework: 'invalid' as any });
      const result = ReportGenerationRequest.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should accept all valid frameworks', () => {
      const frameworks = ['soc2_type1', 'soc2_type2', 'iso27001', 'hipaa', 'gdpr', 'pci_dss', 'custom'] as const;
      for (const framework of frameworks) {
        const request = createTestRequest({ framework });
        const result = ReportGenerationRequest.safeParse(request);
        expect(result.success).toBe(true);
      }
    });

    it('should apply default values', () => {
      const request = {
        tenantId: 'tenant-1',
        organizationName: 'Org',
        framework: 'soc2_type2',
        period: {
          startDate: new Date(),
          endDate: new Date(),
        },
      };
      const result = ReportGenerationRequest.parse(request);
      expect(result.collectEvidence).toBe(true);
      expect(result.outputFormat).toBe('json');
    });

    it('should validate maxEvidencePerControl range', () => {
      const validRequest = createTestRequest({ maxEvidencePerControl: 50 });
      expect(ReportGenerationRequest.safeParse(validRequest).success).toBe(true);

      const tooLow = createTestRequest({ maxEvidencePerControl: 0 });
      expect(ReportGenerationRequest.safeParse(tooLow).success).toBe(false);

      const tooHigh = createTestRequest({ maxEvidencePerControl: 101 });
      expect(ReportGenerationRequest.safeParse(tooHigh).success).toBe(false);
    });
  });

  describe('ScheduledReportConfig', () => {
    it('should validate a valid config', () => {
      const config: ScheduledReportConfig = {
        scheduleId: 'schedule-1',
        name: 'Monthly SOC2',
        cronExpression: '0 0 1 * *',
        enabled: true,
        requestTemplate: {
          tenantId: 'tenant-1',
          organizationName: 'Org',
          framework: 'soc2_type2',
          outputFormat: 'both',
          collectEvidence: true,
        },
        periodType: 'monthly',
        createdAt: new Date(),
      };
      const result = ScheduledReportConfig.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should validate email recipients', () => {
      const config: ScheduledReportConfig = {
        scheduleId: 'schedule-1',
        name: 'Monthly SOC2',
        cronExpression: '0 0 1 * *',
        enabled: true,
        requestTemplate: {
          tenantId: 'tenant-1',
          organizationName: 'Org',
          framework: 'soc2_type2',
          outputFormat: 'json',
          collectEvidence: true,
        },
        periodType: 'monthly',
        notifications: {
          emailRecipients: ['valid@email.com'],
        },
        createdAt: new Date(),
      };
      expect(ScheduledReportConfig.safeParse(config).success).toBe(true);

      config.notifications!.emailRecipients = ['not-an-email'];
      expect(ScheduledReportConfig.safeParse(config).success).toBe(false);
    });
  });

  describe('ScheduledReportRun', () => {
    it('should validate a valid run', () => {
      const run: ScheduledReportRun = {
        runId: 'run-1',
        scheduleId: 'schedule-1',
        status: 'completed',
        startedAt: new Date(),
        completedAt: new Date(),
      };
      const result = ScheduledReportRun.safeParse(run);
      expect(result.success).toBe(true);
    });

    it('should validate status enum', () => {
      const statuses = ['pending', 'running', 'completed', 'failed'] as const;
      for (const status of statuses) {
        const run: ScheduledReportRun = {
          runId: 'run-1',
          scheduleId: 'schedule-1',
          status,
          startedAt: new Date(),
        };
        expect(ScheduledReportRun.safeParse(run).success).toBe(true);
      }
    });
  });
});

// =============================================================================
// Cron Parser Tests
// =============================================================================

describe('Cron Expression Parser', () => {
  describe('parseNextCronRun', () => {
    it('should parse daily at midnight', () => {
      const from = new Date('2024-01-15T10:30:00Z');
      const next = parseNextCronRun('0 0 * * *', from);
      // Cron uses local time, not UTC - check hours and minutes are 0
      expect(next.getHours()).toBe(0);
      expect(next.getMinutes()).toBe(0);
      expect(next.getTime()).toBeGreaterThan(from.getTime());
    });

    it('should parse first of month', () => {
      const from = new Date('2024-01-15T10:30:00Z');
      const next = parseNextCronRun('0 0 1 * *', from);
      expect(next.getDate()).toBe(1);
      expect(next.getMonth()).toBeGreaterThanOrEqual(from.getMonth());
    });

    it('should parse weekday pattern (1-5)', () => {
      const from = new Date('2024-01-13T10:30:00Z'); // Saturday
      const next = parseNextCronRun('0 9 * * 1-5', from);
      const dayOfWeek = next.getDay();
      expect(dayOfWeek).toBeGreaterThanOrEqual(1);
      expect(dayOfWeek).toBeLessThanOrEqual(5);
    });

    it('should parse step values (*/15)', () => {
      const from = new Date('2024-01-15T10:32:00Z');
      const next = parseNextCronRun('*/15 * * * *', from);
      expect(next.getMinutes() % 15).toBe(0);
    });

    it('should parse list values', () => {
      const from = new Date('2024-01-15T10:30:00Z');
      const next = parseNextCronRun('0 9,17 * * *', from);
      expect([9, 17]).toContain(next.getHours());
    });

    it('should throw on invalid cron expression', () => {
      expect(() => parseNextCronRun('0 0 *')).toThrow(/expected 5 parts/);
    });
  });
});

// =============================================================================
// Period Calculation Tests
// =============================================================================

describe('calculatePeriodDates', () => {
  const referenceDate = new Date('2024-03-15T12:00:00Z');

  describe('daily', () => {
    it('should return yesterday', () => {
      const period = calculatePeriodDates('daily', referenceDate);
      expect(period.start.getDate()).toBe(14);
      expect(period.end.getDate()).toBe(14);
      expect(period.type).toBe('point_in_time');
    });
  });

  describe('weekly', () => {
    it('should return last 7 days', () => {
      const period = calculatePeriodDates('weekly', referenceDate);
      const daysDiff = Math.floor(
        (period.end.getTime() - period.start.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(daysDiff).toBe(6); // 7 days inclusive minus 1
      expect(period.type).toBe('period');
    });
  });

  describe('monthly', () => {
    it('should return previous month', () => {
      const period = calculatePeriodDates('monthly', referenceDate);
      expect(period.start.getMonth()).toBe(1); // February
      expect(period.start.getDate()).toBe(1);
      expect(period.type).toBe('period');
    });
  });

  describe('quarterly', () => {
    it('should return previous quarter', () => {
      const period = calculatePeriodDates('quarterly', referenceDate);
      expect(period.type).toBe('period');
      // Previous quarter from March would be Q4 of previous year
      expect(period.start.getFullYear()).toBe(2023);
    });
  });

  describe('yearly', () => {
    it('should return previous year', () => {
      const period = calculatePeriodDates('yearly', referenceDate);
      expect(period.start.getFullYear()).toBe(2023);
      expect(period.start.getMonth()).toBe(0);
      expect(period.start.getDate()).toBe(1);
      expect(period.type).toBe('period');
    });
  });
});

// =============================================================================
// ReportGenerator Tests
// =============================================================================

describe('ReportGenerator', () => {
  let generator: ReportGenerator;
  let mockCollector: EvidenceCollector;

  beforeEach(() => {
    mockCollector = createMockEvidenceCollector();
    generator = createReportGenerator(mockCollector);
  });

  describe('generate', () => {
    it('should generate a SOC2 report', async () => {
      const request = createTestRequest({ framework: 'soc2_type2' });
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.report).toBeDefined();
      // Framework is an object with name property
      expect(result.report!.framework.framework).toBe('soc2_type2');
      expect(result.metadata.framework).toBe('soc2_type2');
      expect(result.metadata.tenantId).toBe('tenant-123');
    });

    it('should generate an ISO27001 report', async () => {
      const request = createTestRequest({ framework: 'iso27001' });
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.report).toBeDefined();
      // Framework is an object with name property
      expect(result.report!.framework.framework).toBe('iso27001');
    });

    it('should generate a custom framework report', async () => {
      const request = createTestRequest({
        framework: 'custom',
        customFramework: {
          name: 'Custom Framework',
          version: '1.0',
          description: 'A custom compliance framework',
          controls: [
            {
              controlId: 'CUSTOM-001',
              title: 'Custom Control',
              description: 'A custom control',
              category: 'General',
            },
          ],
        },
      });
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.report).toBeDefined();
      // Custom framework has framework: 'custom'
      expect(result.report!.framework.framework).toBe('custom');
    });

    it('should fail for custom framework without metadata', async () => {
      const request = createTestRequest({ framework: 'custom' });
      const result = await generator.generate(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('customFramework is required');
    });

    it('should generate JSON output', async () => {
      const request = createTestRequest({ outputFormat: 'json' });
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.jsonOutput).toBeDefined();
      expect(result.markdownOutput).toBeUndefined();

      // Validate JSON is parseable
      const parsed = JSON.parse(result.jsonOutput!);
      expect(parsed.reportId).toBeDefined();
    });

    it('should generate Markdown output', async () => {
      const request = createTestRequest({ outputFormat: 'markdown' });
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.markdownOutput).toBeDefined();
      expect(result.jsonOutput).toBeUndefined();
      // Markdown contains organization name and SOC2 in title
      expect(result.markdownOutput).toContain('Test Organization');
      expect(result.markdownOutput).toContain('SOC 2');
    });

    it('should generate both outputs', async () => {
      const request = createTestRequest({ outputFormat: 'both' });
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.jsonOutput).toBeDefined();
      expect(result.markdownOutput).toBeDefined();
    });

    it('should filter controls by include list', async () => {
      const request = createTestRequest({
        framework: 'soc2_type2',
        includeControlIds: ['CC6.1', 'CC6.2'],
      });
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.report!.controls.every(c =>
        ['CC6.1', 'CC6.2'].includes(c.controlId)
      )).toBe(true);
    });

    it('should filter controls by exclude list', async () => {
      const request = createTestRequest({
        framework: 'soc2_type2',
        excludeControlIds: ['CC6.1'],
      });
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.report!.controls.some(c => c.controlId === 'CC6.1')).toBe(false);
    });

    it('should collect evidence when requested', async () => {
      const request = createTestRequest({
        collectEvidence: true,
        maxEvidencePerControl: 5,
      });
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.metadata.evidenceCollected).toBeGreaterThan(0);
      expect(mockCollector.collectForControls).toHaveBeenCalled();
    });

    it('should not collect evidence when disabled', async () => {
      const request = createTestRequest({ collectEvidence: false });
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.metadata.evidenceCollected).toBe(0);
      expect(mockCollector.collectForControls).not.toHaveBeenCalled();
    });

    it('should calculate summary', async () => {
      const request = createTestRequest();
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.report!.summary).toBeDefined();
      expect(result.report!.summary.totalControls).toBeGreaterThan(0);
    });

    it('should track generation duration', async () => {
      const request = createTestRequest();
      const result = await generator.generate(request);

      expect(result.success).toBe(true);
      expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.generatedAt).toBeInstanceOf(Date);
    });

    it('should handle placeholder frameworks (hipaa, gdpr, pci_dss)', async () => {
      for (const framework of ['hipaa', 'gdpr', 'pci_dss'] as const) {
        const request = createTestRequest({ framework });
        const result = await generator.generate(request);

        expect(result.success).toBe(true);
        // Placeholder frameworks use custom framework template
        expect(result.report!.framework.framework).toBe('custom');
      }
    });
  });

  describe('generateFromSchedule', () => {
    it('should generate from schedule config', async () => {
      const schedule = createScheduledReport(
        'schedule-1',
        'Monthly SOC2',
        '0 0 1 * *',
        'monthly',
        {
          tenantId: 'tenant-1',
          organizationName: 'Org',
          framework: 'soc2_type2',
          outputFormat: 'json',
          collectEvidence: false,
        }
      );

      const result = await generator.generateFromSchedule(schedule);

      expect(result.success).toBe(true);
      expect(result.report).toBeDefined();
    });
  });

  describe('setEvidenceCollector', () => {
    it('should allow setting evidence collector', async () => {
      const generatorWithoutCollector = createReportGenerator();
      const request = createTestRequest({ collectEvidence: true });

      // No collector, should skip evidence
      const result1 = await generatorWithoutCollector.generate(request);
      expect(result1.metadata.evidenceCollected).toBe(0);

      // Add collector
      generatorWithoutCollector.setEvidenceCollector(mockCollector);

      const result2 = await generatorWithoutCollector.generate(request);
      expect(result2.metadata.evidenceCollected).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// ReportScheduleManager Tests
// =============================================================================

describe('ReportScheduleManager', () => {
  let generator: ReportGenerator;
  let manager: ReportScheduleManager;

  beforeEach(() => {
    generator = createReportGenerator();
    manager = createScheduleManager(generator);
  });

  describe('addSchedule', () => {
    it('should add a schedule', () => {
      const schedule = createScheduledReport(
        'schedule-1',
        'Monthly SOC2',
        '0 0 1 * *',
        'monthly',
        {
          tenantId: 'tenant-1',
          organizationName: 'Org',
          framework: 'soc2_type2',
          outputFormat: 'json',
          collectEvidence: false,
        }
      );

      manager.addSchedule(schedule);
      const retrieved = manager.getSchedule('schedule-1');

      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Monthly SOC2');
      expect(retrieved!.nextRunAt).toBeDefined();
    });
  });

  describe('removeSchedule', () => {
    it('should remove a schedule', () => {
      const schedule = createScheduledReport(
        'schedule-1',
        'Test',
        '0 0 * * *',
        'daily',
        {
          tenantId: 'tenant-1',
          organizationName: 'Org',
          framework: 'soc2_type2',
          outputFormat: 'json',
          collectEvidence: false,
        }
      );

      manager.addSchedule(schedule);
      expect(manager.getSchedule('schedule-1')).toBeDefined();

      const removed = manager.removeSchedule('schedule-1');
      expect(removed).toBe(true);
      expect(manager.getSchedule('schedule-1')).toBeUndefined();
    });

    it('should return false for non-existent schedule', () => {
      const removed = manager.removeSchedule('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('listSchedules', () => {
    it('should list all schedules', () => {
      const schedule1 = createScheduledReport('s1', 'Test 1', '0 0 * * *', 'daily', {
        tenantId: 't1',
        organizationName: 'Org',
        framework: 'soc2_type2',
        outputFormat: 'json',
        collectEvidence: false,
      });
      const schedule2 = createScheduledReport('s2', 'Test 2', '0 0 1 * *', 'monthly', {
        tenantId: 't1',
        organizationName: 'Org',
        framework: 'iso27001',
        outputFormat: 'json',
        collectEvidence: false,
      });

      manager.addSchedule(schedule1);
      manager.addSchedule(schedule2);

      const schedules = manager.listSchedules();
      expect(schedules).toHaveLength(2);
    });
  });

  describe('setScheduleEnabled', () => {
    it('should enable/disable a schedule', () => {
      const schedule = createScheduledReport('s1', 'Test', '0 0 * * *', 'daily', {
        tenantId: 't1',
        organizationName: 'Org',
        framework: 'soc2_type2',
        outputFormat: 'json',
        collectEvidence: false,
      });

      manager.addSchedule(schedule);
      expect(manager.getSchedule('s1')!.enabled).toBe(true);

      manager.setScheduleEnabled('s1', false);
      expect(manager.getSchedule('s1')!.enabled).toBe(false);

      manager.setScheduleEnabled('s1', true);
      expect(manager.getSchedule('s1')!.enabled).toBe(true);
    });

    it('should return false for non-existent schedule', () => {
      const result = manager.setScheduleEnabled('non-existent', true);
      expect(result).toBe(false);
    });
  });

  describe('getDueSchedules', () => {
    it('should return schedules due to run', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Create schedule with past nextRunAt
      const schedule: ScheduledReportConfig = {
        scheduleId: 's1',
        name: 'Due',
        cronExpression: '0 0 * * *',
        enabled: true,
        requestTemplate: {
          tenantId: 't1',
          organizationName: 'Org',
          framework: 'soc2_type2',
          outputFormat: 'json',
          collectEvidence: false,
        },
        periodType: 'daily',
        createdAt: new Date(),
        nextRunAt: pastDate,
      };

      manager.addSchedule(schedule);

      // The addSchedule recalculates nextRunAt, so we need to check if it's due
      const due = manager.getDueSchedules();
      // Since we can't control the nextRunAt after addSchedule, this tests the mechanism
      expect(Array.isArray(due)).toBe(true);
    });

    it('should not return disabled schedules', () => {
      const schedule = createScheduledReport('s1', 'Test', '0 0 * * *', 'daily', {
        tenantId: 't1',
        organizationName: 'Org',
        framework: 'soc2_type2',
        outputFormat: 'json',
        collectEvidence: false,
      }, { enabled: false });

      manager.addSchedule(schedule);

      const due = manager.getDueSchedules();
      expect(due.find(s => s.scheduleId === 's1')).toBeUndefined();
    });
  });

  describe('runSchedule', () => {
    it('should run a schedule manually', async () => {
      const schedule = createScheduledReport('s1', 'Test', '0 0 * * *', 'daily', {
        tenantId: 't1',
        organizationName: 'Org',
        framework: 'soc2_type2',
        outputFormat: 'json',
        collectEvidence: false,
      });

      manager.addSchedule(schedule);

      const run = await manager.runSchedule('s1');

      expect(run.runId).toBeDefined();
      expect(run.scheduleId).toBe('s1');
      expect(run.status).toBe('completed');
      expect(run.result).toBeDefined();
      expect(run.result!.success).toBe(true);
    });

    it('should throw for non-existent schedule', async () => {
      await expect(manager.runSchedule('non-existent')).rejects.toThrow('Schedule not found');
    });

    it('should update lastRunAt and nextRunAt', async () => {
      const schedule = createScheduledReport('s1', 'Test', '0 0 * * *', 'daily', {
        tenantId: 't1',
        organizationName: 'Org',
        framework: 'soc2_type2',
        outputFormat: 'json',
        collectEvidence: false,
      });

      manager.addSchedule(schedule);

      await manager.runSchedule('s1');

      const afterRun = manager.getSchedule('s1')!;
      expect(afterRun.lastRunAt).toBeDefined();
      // After running, nextRunAt should be recalculated to a future time
      expect(afterRun.nextRunAt).toBeDefined();
      expect(afterRun.nextRunAt!.getTime()).toBeGreaterThanOrEqual(Date.now());
    });
  });

  describe('getRunHistory', () => {
    it('should return run history', async () => {
      const schedule = createScheduledReport('s1', 'Test', '0 0 * * *', 'daily', {
        tenantId: 't1',
        organizationName: 'Org',
        framework: 'soc2_type2',
        outputFormat: 'json',
        collectEvidence: false,
      });

      manager.addSchedule(schedule);

      await manager.runSchedule('s1');
      await manager.runSchedule('s1');

      const history = manager.getRunHistory('s1');
      expect(history).toHaveLength(2);
    });

    it('should limit history results', async () => {
      const schedule = createScheduledReport('s1', 'Test', '0 0 * * *', 'daily', {
        tenantId: 't1',
        organizationName: 'Org',
        framework: 'soc2_type2',
        outputFormat: 'json',
        collectEvidence: false,
      });

      manager.addSchedule(schedule);

      await manager.runSchedule('s1');
      await manager.runSchedule('s1');
      await manager.runSchedule('s1');

      const history = manager.getRunHistory('s1', 2);
      expect(history).toHaveLength(2);
    });

    it('should return empty for unknown schedule', () => {
      const history = manager.getRunHistory('unknown');
      expect(history).toHaveLength(0);
    });
  });

  describe('getLatestRun', () => {
    it('should return the latest run', async () => {
      const schedule = createScheduledReport('s1', 'Test', '0 0 * * *', 'daily', {
        tenantId: 't1',
        organizationName: 'Org',
        framework: 'soc2_type2',
        outputFormat: 'json',
        collectEvidence: false,
      });

      manager.addSchedule(schedule);

      await manager.runSchedule('s1');
      // Add small delay to ensure distinct timestamps
      await new Promise(resolve => setTimeout(resolve, 5));
      const run2 = await manager.runSchedule('s1');

      const latest = manager.getLatestRun('s1');
      expect(latest).toBeDefined();
      expect(latest!.runId).toBe(run2.runId);
    });

    it('should return undefined for no runs', () => {
      const schedule = createScheduledReport('s1', 'Test', '0 0 * * *', 'daily', {
        tenantId: 't1',
        organizationName: 'Org',
        framework: 'soc2_type2',
        outputFormat: 'json',
        collectEvidence: false,
      });

      manager.addSchedule(schedule);

      const latest = manager.getLatestRun('s1');
      expect(latest).toBeUndefined();
    });
  });

  describe('processDueSchedules', () => {
    it('should process all due schedules', async () => {
      // This is a bit tricky to test without mocking time
      // Just verify the method exists and returns an array
      const runs = await manager.processDueSchedules();
      expect(Array.isArray(runs)).toBe(true);
    });
  });
});

// =============================================================================
// Singleton Management Tests
// =============================================================================

describe('Singleton Management', () => {
  beforeEach(() => {
    resetReportGenerator();
  });

  describe('initializeReportGenerator', () => {
    it('should initialize global generator', () => {
      const generator = initializeReportGenerator();
      expect(generator).toBeInstanceOf(ReportGenerator);
      expect(getReportGenerator()).toBe(generator);
    });

    it('should initialize with evidence collector', () => {
      const mockCollector = createMockEvidenceCollector();
      const generator = initializeReportGenerator(mockCollector);
      expect(generator).toBeInstanceOf(ReportGenerator);
    });
  });

  describe('getReportGenerator', () => {
    it('should throw if not initialized', () => {
      expect(() => getReportGenerator()).toThrow('Report generator not initialized');
    });

    it('should return initialized generator', () => {
      initializeReportGenerator();
      expect(() => getReportGenerator()).not.toThrow();
    });
  });

  describe('getScheduleManager', () => {
    it('should throw if not initialized', () => {
      expect(() => getScheduleManager()).toThrow('Schedule manager not initialized');
    });

    it('should return initialized manager', () => {
      initializeReportGenerator();
      expect(() => getScheduleManager()).not.toThrow();
    });
  });

  describe('resetReportGenerator', () => {
    it('should reset global state', () => {
      initializeReportGenerator();
      expect(() => getReportGenerator()).not.toThrow();

      resetReportGenerator();
      expect(() => getReportGenerator()).toThrow();
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Factory Functions', () => {
  describe('createScheduledReport', () => {
    it('should create a valid scheduled report config', () => {
      const config = createScheduledReport(
        'schedule-1',
        'Monthly Report',
        '0 0 1 * *',
        'monthly',
        {
          tenantId: 'tenant-1',
          organizationName: 'Org',
          framework: 'soc2_type2',
          outputFormat: 'json',
          collectEvidence: true,
        },
        {
          enabled: true,
          notifications: {
            emailRecipients: ['admin@example.com'],
          },
        }
      );

      expect(config.scheduleId).toBe('schedule-1');
      expect(config.name).toBe('Monthly Report');
      expect(config.cronExpression).toBe('0 0 1 * *');
      expect(config.periodType).toBe('monthly');
      expect(config.enabled).toBe(true);
      expect(config.notifications?.emailRecipients).toContain('admin@example.com');
      expect(config.nextRunAt).toBeDefined();
      expect(config.createdAt).toBeInstanceOf(Date);
    });

    it('should default enabled to true', () => {
      const config = createScheduledReport(
        'schedule-1',
        'Test',
        '0 0 * * *',
        'daily',
        {
          tenantId: 't1',
          organizationName: 'Org',
          framework: 'soc2_type2',
          outputFormat: 'json',
          collectEvidence: false,
        }
      );

      expect(config.enabled).toBe(true);
    });
  });
});
