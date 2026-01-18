/**
 * Compliance Report Generator
 *
 * Epic D: Policy & Audit - Story D4: Compliance Reports
 * Task D4.3: Create report generator
 *
 * Generates compliance reports on demand or scheduled.
 * Supports date ranges, scope filters, and format options.
 *
 * Integrates:
 * - D4.1: Report templates (SOC2, ISO27001, custom)
 * - D4.2: Evidence collection
 *
 * @module @gwi/core/policy/report-generator
 */

import { z } from 'zod';
import type {
  ComplianceReportTemplate,
  ControlDefinition,
  ReportPeriod,
} from './report-templates.js';
import {
  createSOC2Template,
  createISO27001Template,
  createCustomTemplate,
  calculateReportSummary,
  formatReportAsMarkdown,
  formatReportAsJSON,
} from './report-templates.js';
import type {
  EvidenceCollector,
  EvidenceTimeRange,
} from './evidence-collector.js';
import { linkEvidenceToControl } from './evidence-collector.js';

// =============================================================================
// Report Generation Types
// =============================================================================

/**
 * Report generation request
 */
// Base schema without refinement (for .omit() usage)
export const ReportGenerationRequestBase = z.object({
  /** Tenant ID */
  tenantId: z.string().min(1),
  /** Organization name for the report */
  organizationName: z.string().min(1),
  /** Compliance framework */
  framework: z.enum(['soc2_type1', 'soc2_type2', 'iso27001', 'hipaa', 'gdpr', 'pci_dss', 'custom']),
  /** Report period */
  period: z.object({
    startDate: z.date(),
    endDate: z.date(),
    description: z.string().optional(),
  }),
  /** Scope description */
  scope: z.string().optional(),
  /** Systems in scope */
  systemsInScope: z.array(z.string()).optional(),
  /** Exclusions */
  exclusions: z.array(z.string()).optional(),
  /** Custom report title (optional) */
  title: z.string().optional(),
  /** Custom report description (optional) */
  description: z.string().optional(),
  /** Control IDs to include (if empty, include all) */
  includeControlIds: z.array(z.string()).optional(),
  /** Control IDs to exclude */
  excludeControlIds: z.array(z.string()).optional(),
  /** Whether to collect evidence automatically */
  collectEvidence: z.boolean().default(true),
  /** Maximum evidence items per control */
  maxEvidencePerControl: z.number().min(1).max(100).optional(),
  /** Output format */
  outputFormat: z.enum(['json', 'markdown', 'both']).default('json'),
  /** For custom framework: framework metadata */
  customFramework: z.object({
    name: z.string(),
    version: z.string(),
    description: z.string(),
    controls: z.array(z.object({
      controlId: z.string(),
      title: z.string(),
      description: z.string(),
      category: z.string(),
      subCategory: z.string().optional(),
      priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
      parentControlId: z.string().optional(),
      finding: z.string().optional(),
      implementation: z.string().optional(),
      testingProcedure: z.string().optional(),
      testResults: z.string().optional(),
      evaluatedAt: z.date().optional(),
      evaluatedBy: z.string().optional(),
    })).optional(),
  }).optional(),
});

// Schema with refinement for validation (customFramework required when framework is 'custom')
export const ReportGenerationRequest = ReportGenerationRequestBase.refine(
  (data) => data.framework !== 'custom' || !!data.customFramework,
  {
    message: "customFramework is required when framework is 'custom'",
    path: ['customFramework'],
  }
);
export type ReportGenerationRequest = z.infer<typeof ReportGenerationRequest>;

/**
 * Report generation result
 */
export const ReportGenerationResult = z.object({
  /** Whether generation succeeded */
  success: z.boolean(),
  /** Generated report (if successful) */
  report: z.custom<ComplianceReportTemplate>().optional(),
  /** Report in JSON format (if requested) */
  jsonOutput: z.string().optional(),
  /** Report in Markdown format (if requested) */
  markdownOutput: z.string().optional(),
  /** Error message (if failed) */
  error: z.string().optional(),
  /** Generation metadata */
  metadata: z.object({
    generatedAt: z.date(),
    durationMs: z.number(),
    controlsEvaluated: z.number(),
    evidenceCollected: z.number(),
    framework: z.string(),
    tenantId: z.string(),
  }),
});
export type ReportGenerationResult = z.infer<typeof ReportGenerationResult>;

/**
 * Scheduled report configuration
 */
export const ScheduledReportConfig = z.object({
  /** Unique schedule ID */
  scheduleId: z.string(),
  /** Schedule name */
  name: z.string(),
  /** Cron expression (e.g., "0 0 1 * *" for monthly) */
  cronExpression: z.string(),
  /** Whether schedule is enabled */
  enabled: z.boolean().default(true),
  /** Report generation request template */
  requestTemplate: ReportGenerationRequestBase.omit({ period: true }),
  /** Period type for automatic date calculation */
  periodType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  /** Notification settings */
  notifications: z.object({
    /** Email recipients */
    emailRecipients: z.array(z.string().email()).optional(),
    /** Webhook URL */
    webhookUrl: z.string().url().optional(),
    /** Slack channel */
    slackChannel: z.string().optional(),
  }).optional(),
  /** Created timestamp */
  createdAt: z.date(),
  /** Last run timestamp */
  lastRunAt: z.date().optional(),
  /** Next scheduled run */
  nextRunAt: z.date().optional(),
});
export type ScheduledReportConfig = z.infer<typeof ScheduledReportConfig>;

/**
 * Scheduled report run result
 */
export const ScheduledReportRun = z.object({
  /** Run ID */
  runId: z.string(),
  /** Schedule ID */
  scheduleId: z.string(),
  /** Run status */
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  /** Start timestamp */
  startedAt: z.date(),
  /** End timestamp */
  completedAt: z.date().optional(),
  /** Generation result */
  result: ReportGenerationResult.optional(),
  /** Error if failed */
  error: z.string().optional(),
});
export type ScheduledReportRun = z.infer<typeof ScheduledReportRun>;

// =============================================================================
// Cron Expression Parser (Simplified)
// =============================================================================

/**
 * Parse a cron expression and get the next run time
 * Supports: minute hour day-of-month month day-of-week
 *
 * Common patterns:
 * - "0 0 1 * *" - First day of every month at midnight
 * - "0 0 * * 0" - Every Sunday at midnight
 * - "0 0 * * *" - Every day at midnight
 * - "0 9 * * 1-5" - Weekdays at 9am
 */
export function parseNextCronRun(cronExpression: string, from: Date = new Date()): Date {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 parts, got ${parts.length}`);
  }

  const [minuteExpr, hourExpr, dayExpr, monthExpr, dowExpr] = parts;

  // Simple implementation: find next matching time
  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);

  // Start from the next minute
  next.setMinutes(next.getMinutes() + 1);

  // Try up to 366 days to find a match
  for (let attempts = 0; attempts < 366 * 24 * 60; attempts++) {
    if (
      matchesCronPart(next.getMinutes(), minuteExpr) &&
      matchesCronPart(next.getHours(), hourExpr) &&
      matchesCronPart(next.getDate(), dayExpr) &&
      matchesCronPart(next.getMonth() + 1, monthExpr) &&
      matchesCronPart(next.getDay(), dowExpr)
    ) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  throw new Error('Could not find next cron run within 366 days');
}

/**
 * Check if a value matches a cron part expression
 */
function matchesCronPart(value: number, expr: string): boolean {
  if (expr === '*') return true;

  // Handle ranges (e.g., "1-5")
  if (expr.includes('-')) {
    const [start, end] = expr.split('-').map(Number);
    return value >= start && value <= end;
  }

  // Handle lists (e.g., "1,15")
  if (expr.includes(',')) {
    return expr.split(',').map(Number).includes(value);
  }

  // Handle step values (e.g., "*/5")
  if (expr.startsWith('*/')) {
    const step = Number(expr.slice(2));
    return value % step === 0;
  }

  // Exact match
  return Number(expr) === value;
}

/**
 * Calculate period dates based on period type
 */
export function calculatePeriodDates(
  periodType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
  referenceDate: Date = new Date()
): ReportPeriod {
  const end = new Date(referenceDate);
  end.setHours(23, 59, 59, 999);

  const start = new Date(referenceDate);
  start.setHours(0, 0, 0, 0);

  // Determine period type for ReportPeriod
  const type: 'period' | 'point_in_time' | 'custom' = periodType === 'daily' ? 'point_in_time' : 'period';

  switch (periodType) {
    case 'daily':
      // Yesterday
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;

    case 'weekly':
      // Last 7 days
      start.setDate(start.getDate() - 7);
      end.setDate(end.getDate() - 1);
      break;

    case 'monthly':
      // Previous month
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      end.setDate(0); // Last day of previous month
      break;

    case 'quarterly':
      // Previous quarter
      const currentQuarter = Math.floor(start.getMonth() / 3);
      const prevQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
      const prevQuarterYear = currentQuarter === 0 ? start.getFullYear() - 1 : start.getFullYear();
      start.setFullYear(prevQuarterYear);
      start.setMonth(prevQuarter * 3);
      start.setDate(1);
      end.setFullYear(prevQuarterYear);
      end.setMonth(prevQuarter * 3 + 3);
      end.setDate(0);
      break;

    case 'yearly':
      // Previous year
      start.setFullYear(start.getFullYear() - 1);
      start.setMonth(0);
      start.setDate(1);
      end.setMonth(0);
      end.setDate(0);
      break;
  }

  return { start, end, type };
}

// =============================================================================
// Report Generator
// =============================================================================

/**
 * Report generator configuration
 */
export interface ReportGeneratorConfig {
  /** Evidence collector instance */
  evidenceCollector?: EvidenceCollector;
  /** Default max evidence per control */
  defaultMaxEvidencePerControl?: number;
  /** Generator ID for tracking */
  generatorId?: string;
}

/**
 * Report generator service
 */
export class ReportGenerator {
  private evidenceCollector?: EvidenceCollector;
  private defaultMaxEvidencePerControl: number;

  constructor(config: ReportGeneratorConfig = {}) {
    this.evidenceCollector = config.evidenceCollector;
    this.defaultMaxEvidencePerControl = config.defaultMaxEvidencePerControl ?? 10;
  }

  /**
   * Generate a compliance report
   */
  async generate(request: ReportGenerationRequest): Promise<ReportGenerationResult> {
    const startTime = Date.now();
    let evidenceCollected = 0;

    try {
      // Validate request
      const validatedRequest = ReportGenerationRequest.parse(request);

      // Create the report template based on framework
      let report = this.createReportTemplate(validatedRequest);

      // Filter controls if specified
      report = this.filterControls(report, validatedRequest);

      // Collect and link evidence if requested
      if (validatedRequest.collectEvidence && this.evidenceCollector) {
        const evidenceResult = await this.collectAndLinkEvidence(
          report,
          validatedRequest
        );
        report = evidenceResult.report;
        evidenceCollected = evidenceResult.evidenceCount;
      }

      // Calculate summary
      report = {
        ...report,
        summary: calculateReportSummary(report.controls),
      };

      // Generate outputs
      let jsonOutput: string | undefined;
      let markdownOutput: string | undefined;

      if (validatedRequest.outputFormat === 'json' || validatedRequest.outputFormat === 'both') {
        jsonOutput = formatReportAsJSON(report);
      }

      if (validatedRequest.outputFormat === 'markdown' || validatedRequest.outputFormat === 'both') {
        markdownOutput = formatReportAsMarkdown(report);
      }

      return {
        success: true,
        report,
        jsonOutput,
        markdownOutput,
        metadata: {
          generatedAt: new Date(),
          durationMs: Date.now() - startTime,
          controlsEvaluated: report.controls.length,
          evidenceCollected,
          framework: validatedRequest.framework,
          tenantId: validatedRequest.tenantId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          generatedAt: new Date(),
          durationMs: Date.now() - startTime,
          controlsEvaluated: 0,
          evidenceCollected: 0,
          framework: request.framework,
          tenantId: request.tenantId,
        },
      };
    }
  }

  /**
   * Create a report template based on framework
   */
  private createReportTemplate(request: ReportGenerationRequest): ComplianceReportTemplate {
    const period: ReportPeriod = {
      start: request.period.startDate,
      end: request.period.endDate,
      type: 'period',
    };

    const options = {
      title: request.title,
      description: request.description,
      scope: request.scope ?? `Compliance assessment for ${request.organizationName}`,
      systemsInScope: request.systemsInScope ?? [],
      exclusions: request.exclusions ?? [],
    };

    switch (request.framework) {
      case 'soc2_type1':
        return createSOC2Template(
          request.tenantId,
          request.organizationName,
          period,
          'soc2_type1',
          options
        );

      case 'soc2_type2':
        return createSOC2Template(
          request.tenantId,
          request.organizationName,
          period,
          'soc2_type2',
          options
        );

      case 'iso27001':
        return createISO27001Template(
          request.tenantId,
          request.organizationName,
          period,
          options
        );

      case 'custom':
        if (!request.customFramework) {
          throw new Error('customFramework is required for custom framework type');
        }
        return createCustomTemplate(
          request.tenantId,
          request.organizationName,
          period,
          request.customFramework.name,
          request.customFramework.controls ?? [],
          {
            ...options,
            frameworkVersion: request.customFramework.version,
          }
        );

      // Placeholder for other frameworks
      case 'hipaa':
      case 'gdpr':
      case 'pci_dss':
        // Use custom template with framework-specific metadata
        return createCustomTemplate(
          request.tenantId,
          request.organizationName,
          period,
          request.framework.toUpperCase(),
          [],
          options
        );

      default:
        throw new Error(`Unsupported framework: ${request.framework}`);
    }
  }

  /**
   * Filter controls based on include/exclude lists
   */
  private filterControls(
    report: ComplianceReportTemplate,
    request: ReportGenerationRequest
  ): ComplianceReportTemplate {
    let controls = [...report.controls];

    // Filter by include list
    if (request.includeControlIds && request.includeControlIds.length > 0) {
      controls = controls.filter(c =>
        request.includeControlIds!.includes(c.controlId)
      );
    }

    // Filter by exclude list
    if (request.excludeControlIds && request.excludeControlIds.length > 0) {
      controls = controls.filter(c =>
        !request.excludeControlIds!.includes(c.controlId)
      );
    }

    return { ...report, controls };
  }

  /**
   * Collect evidence and link to controls
   */
  private async collectAndLinkEvidence(
    report: ComplianceReportTemplate,
    request: ReportGenerationRequest
  ): Promise<{ report: ComplianceReportTemplate; evidenceCount: number }> {
    if (!this.evidenceCollector) {
      return { report, evidenceCount: 0 };
    }

    const timeRange: EvidenceTimeRange = {
      startDate: request.period.startDate,
      endDate: request.period.endDate,
    };

    const maxPerControl = request.maxEvidencePerControl ?? this.defaultMaxEvidencePerControl;

    // Collect evidence for all controls
    const evidenceMap = await this.evidenceCollector.collectForControls(
      request.tenantId,
      report.controls,
      timeRange
    );

    // Link evidence to controls
    let totalEvidence = 0;
    const updatedControls: ControlDefinition[] = [];

    for (const control of report.controls) {
      const controlEvidence = evidenceMap.get(control.controlId) ?? [];

      // Take top N evidence items
      const topEvidence = controlEvidence
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, maxPerControl);

      const updatedControl = linkEvidenceToControl(control, topEvidence);
      updatedControls.push(updatedControl);
      totalEvidence += topEvidence.length;
    }

    return {
      report: { ...report, controls: updatedControls },
      evidenceCount: totalEvidence,
    };
  }

  /**
   * Set evidence collector
   */
  setEvidenceCollector(collector: EvidenceCollector): void {
    this.evidenceCollector = collector;
  }

  /**
   * Generate a report from a scheduled config
   */
  async generateFromSchedule(
    schedule: ScheduledReportConfig,
    referenceDate: Date = new Date()
  ): Promise<ReportGenerationResult> {
    // Calculate period based on schedule type
    const calculatedPeriod = calculatePeriodDates(schedule.periodType, referenceDate);

    // Build the full request - convert ReportPeriod to request period format
    const request: ReportGenerationRequest = {
      ...schedule.requestTemplate,
      period: {
        startDate: calculatedPeriod.start,
        endDate: calculatedPeriod.end,
      },
    };

    return this.generate(request);
  }
}

// =============================================================================
// Schedule Manager
// =============================================================================

/**
 * Schedule manager for periodic report generation
 */
export class ReportScheduleManager {
  private schedules: Map<string, ScheduledReportConfig> = new Map();
  private runs: Map<string, ScheduledReportRun[]> = new Map();
  private generator: ReportGenerator;

  constructor(generator: ReportGenerator) {
    this.generator = generator;
  }

  /**
   * Add a schedule
   */
  addSchedule(config: ScheduledReportConfig): void {
    // Calculate next run time
    const nextRunAt = parseNextCronRun(config.cronExpression);
    const scheduleWithNext = { ...config, nextRunAt };
    this.schedules.set(config.scheduleId, scheduleWithNext);
    this.runs.set(config.scheduleId, []);
  }

  /**
   * Remove a schedule
   */
  removeSchedule(scheduleId: string): boolean {
    this.runs.delete(scheduleId);
    return this.schedules.delete(scheduleId);
  }

  /**
   * Get a schedule by ID
   */
  getSchedule(scheduleId: string): ScheduledReportConfig | undefined {
    return this.schedules.get(scheduleId);
  }

  /**
   * List all schedules
   */
  listSchedules(): ScheduledReportConfig[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Enable/disable a schedule
   */
  setScheduleEnabled(scheduleId: string, enabled: boolean): boolean {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return false;

    this.schedules.set(scheduleId, { ...schedule, enabled });
    return true;
  }

  /**
   * Get schedules due to run
   */
  getDueSchedules(asOf: Date = new Date()): ScheduledReportConfig[] {
    return Array.from(this.schedules.values()).filter(schedule =>
      schedule.enabled &&
      schedule.nextRunAt &&
      schedule.nextRunAt <= asOf
    );
  }

  /**
   * Run a schedule manually
   */
  async runSchedule(scheduleId: string): Promise<ScheduledReportRun> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const run: ScheduledReportRun = {
      runId,
      scheduleId,
      status: 'running',
      startedAt: new Date(),
    };

    // Store the run
    const scheduleRuns = this.runs.get(scheduleId) ?? [];
    scheduleRuns.push(run);
    this.runs.set(scheduleId, scheduleRuns);

    try {
      // Generate the report
      const result = await this.generator.generateFromSchedule(schedule);

      // Update run status
      run.status = result.success ? 'completed' : 'failed';
      run.completedAt = new Date();
      run.result = result;
      if (!result.success) {
        run.error = result.error;
      }

      // Update schedule timestamps
      const updatedSchedule: ScheduledReportConfig = {
        ...schedule,
        lastRunAt: run.startedAt,
        nextRunAt: parseNextCronRun(schedule.cronExpression),
      };
      this.schedules.set(scheduleId, updatedSchedule);

      return run;
    } catch (error) {
      run.status = 'failed';
      run.completedAt = new Date();
      run.error = error instanceof Error ? error.message : String(error);
      return run;
    }
  }

  /**
   * Process all due schedules
   */
  async processDueSchedules(): Promise<ScheduledReportRun[]> {
    const dueSchedules = this.getDueSchedules();
    const runs: ScheduledReportRun[] = [];

    for (const schedule of dueSchedules) {
      const run = await this.runSchedule(schedule.scheduleId);
      runs.push(run);
    }

    return runs;
  }

  /**
   * Get run history for a schedule
   */
  getRunHistory(scheduleId: string, limit?: number): ScheduledReportRun[] {
    const runs = this.runs.get(scheduleId) ?? [];
    const sorted = [...runs].sort((a, b) =>
      b.startedAt.getTime() - a.startedAt.getTime()
    );
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Get the latest run for a schedule
   */
  getLatestRun(scheduleId: string): ScheduledReportRun | undefined {
    const history = this.getRunHistory(scheduleId, 1);
    return history[0];
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a report generator
 */
export function createReportGenerator(
  evidenceCollector?: EvidenceCollector,
  options?: {
    defaultMaxEvidencePerControl?: number;
    generatorId?: string;
  }
): ReportGenerator {
  return new ReportGenerator({
    evidenceCollector,
    ...options,
  });
}

/**
 * Create a schedule manager
 */
export function createScheduleManager(generator: ReportGenerator): ReportScheduleManager {
  return new ReportScheduleManager(generator);
}

/**
 * Create a scheduled report config
 */
export function createScheduledReport(
  scheduleId: string,
  name: string,
  cronExpression: string,
  periodType: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
  requestTemplate: Omit<ReportGenerationRequest, 'period'>,
  options?: {
    enabled?: boolean;
    notifications?: ScheduledReportConfig['notifications'];
  }
): ScheduledReportConfig {
  return {
    scheduleId,
    name,
    cronExpression,
    periodType,
    requestTemplate,
    enabled: options?.enabled ?? true,
    notifications: options?.notifications,
    createdAt: new Date(),
    nextRunAt: parseNextCronRun(cronExpression),
  };
}

// =============================================================================
// Singleton Management
// =============================================================================

let globalReportGenerator: ReportGenerator | null = null;
let globalScheduleManager: ReportScheduleManager | null = null;

/**
 * Initialize the global report generator
 */
export function initializeReportGenerator(
  evidenceCollector?: EvidenceCollector,
  options?: {
    defaultMaxEvidencePerControl?: number;
    generatorId?: string;
  }
): ReportGenerator {
  globalReportGenerator = createReportGenerator(evidenceCollector, options);
  globalScheduleManager = createScheduleManager(globalReportGenerator);
  return globalReportGenerator;
}

/**
 * Get the global report generator
 */
export function getReportGenerator(): ReportGenerator {
  if (!globalReportGenerator) {
    throw new Error('Report generator not initialized. Call initializeReportGenerator first.');
  }
  return globalReportGenerator;
}

/**
 * Get the global schedule manager
 */
export function getScheduleManager(): ReportScheduleManager {
  if (!globalScheduleManager) {
    throw new Error('Schedule manager not initialized. Call initializeReportGenerator first.');
  }
  return globalScheduleManager;
}

/**
 * Set the global report generator
 */
export function setReportGenerator(generator: ReportGenerator): void {
  globalReportGenerator = generator;
  globalScheduleManager = createScheduleManager(generator);
}

/**
 * Reset the global report generator
 */
export function resetReportGenerator(): void {
  globalReportGenerator = null;
  globalScheduleManager = null;
}
