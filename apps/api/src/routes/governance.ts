/**
 * Governance & Compliance API Routes
 *
 * Epic E: RBAC & Governance
 *
 * All endpoints require ADMIN or OWNER role for access to sensitive audit data.
 *
 * @module @gwi/api/routes/governance
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createAuditQueryService,
  createComplianceService,
  type AuditQueryFilters,
  type ReportPeriod,
  createQuotaManager,
  getSecurityAuditStore,
} from '@gwi/core';

// =============================================================================
// Request Schemas
// =============================================================================

const AuditQuerySchema = z.object({
  userId: z.string().optional(),
  eventType: z.string().optional(),
  actionPattern: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  outcome: z.enum(['success', 'failure', 'denied', 'error']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

const AuditSummarySchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

const UserActivitySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
});

const ResourceHistorySchema = z.object({
  resourceType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional().default(100),
});

const AnomalyDetectionSchema = z.object({
  lookbackDays: z.coerce.number().int().positive().max(90).optional().default(7),
  minThreshold: z.coerce.number().int().positive().optional().default(5),
});

const ReportPeriodSchema = z.enum(['day', 'week', 'month', 'quarter', 'year', 'custom']);

const GenerateReportSchema = z.object({
  period: ReportPeriodSchema,
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

// =============================================================================
// Service Instances
// =============================================================================

// Initialize services (singleton pattern)
let auditQueryService: ReturnType<typeof createAuditQueryService> | null = null;
let complianceService: ReturnType<typeof createComplianceService> | null = null;
let quotaManager: ReturnType<typeof createQuotaManager> | null = null;

function getAuditQueryService() {
  if (!auditQueryService) {
    const auditStore = getSecurityAuditStore();
    auditQueryService = createAuditQueryService(auditStore);
  }
  return auditQueryService;
}

function getComplianceService() {
  if (!complianceService) {
    const auditStore = getSecurityAuditStore();
    if (!quotaManager) {
      quotaManager = createQuotaManager({});
    }
    complianceService = createComplianceService(auditStore, quotaManager);
  }
  return complianceService;
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * GET /api/v1/tenants/:tenantId/audit
 * Query audit trail with filters
 */
export async function queryAuditTrail(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const query = AuditQuerySchema.parse(req.query);

    const filters: AuditQueryFilters = {
      tenantId,
      userId: query.userId,
      eventType: query.eventType as any,
      actionPattern: query.actionPattern,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      outcome: query.outcome,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
      offset: query.offset,
    };

    const service = getAuditQueryService();
    const result = await service.queryAuditTrail(filters);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
      });
    } else {
      console.error('Error querying audit trail:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * GET /api/v1/tenants/:tenantId/audit/summary
 * Get audit summary with aggregated statistics
 */
export async function getAuditSummary(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const query = AuditSummarySchema.parse(req.query);

    const startDate = new Date(query.startDate);
    const endDate = new Date(query.endDate);

    const service = getAuditQueryService();
    const summary = await service.getAuditSummary(tenantId, startDate, endDate);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
      });
    } else {
      console.error('Error generating audit summary:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * GET /api/v1/tenants/:tenantId/audit/users/:userId
 * Get user activity log
 */
export async function getUserActivity(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId, userId } = req.params;
    const query = UserActivitySchema.parse(req.query);

    const service = getAuditQueryService();
    const events = await service.getUserActivity(userId, tenantId, {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
    });

    res.status(200).json({
      success: true,
      data: {
        userId,
        tenantId,
        totalEvents: events.length,
        events,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
      });
    } else {
      console.error('Error fetching user activity:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * GET /api/v1/tenants/:tenantId/audit/resources/:resourceId
 * Get resource change history
 */
export async function getResourceHistory(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId, resourceId } = req.params;
    const query = ResourceHistorySchema.parse(req.query);

    const service = getAuditQueryService();
    const events = await service.getResourceHistory(resourceId, tenantId, {
      resourceType: query.resourceType,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      limit: query.limit,
    });

    res.status(200).json({
      success: true,
      data: {
        resourceId,
        tenantId,
        totalEvents: events.length,
        events,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
      });
    } else {
      console.error('Error fetching resource history:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * GET /api/v1/tenants/:tenantId/audit/anomalies
 * Detect unusual access patterns
 */
export async function detectAnomalies(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const query = AnomalyDetectionSchema.parse(req.query);

    const service = getAuditQueryService();
    const result = await service.detectAnomalies(tenantId, {
      lookbackDays: query.lookbackDays,
      minThreshold: query.minThreshold,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
      });
    } else {
      console.error('Error detecting anomalies:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * GET /api/v1/tenants/:tenantId/reports/access
 * Generate access report
 */
export async function generateAccessReport(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const query = GenerateReportSchema.parse(req.query);

    const customRange =
      query.period === 'custom' && query.startDate && query.endDate
        ? { start: new Date(query.startDate), end: new Date(query.endDate) }
        : undefined;

    const service = getComplianceService();
    const report = await service.generateAccessReport(
      tenantId,
      query.period as ReportPeriod,
      customRange
    );

    if (query.format === 'csv') {
      const csv = service.exportToCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="access-report-${tenantId}-${Date.now()}.csv"`
      );
      res.status(200).send(csv);
    } else {
      res.status(200).json({
        success: true,
        data: report,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
      });
    } else {
      console.error('Error generating access report:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * GET /api/v1/tenants/:tenantId/reports/rbac
 * Generate RBAC compliance report
 */
export async function generateRBACReport(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const query = GenerateReportSchema.parse(req.query);

    const customRange =
      query.period === 'custom' && query.startDate && query.endDate
        ? { start: new Date(query.startDate), end: new Date(query.endDate) }
        : undefined;

    const service = getComplianceService();
    const report = await service.generateRBACComplianceReport(
      tenantId,
      query.period as ReportPeriod,
      customRange
    );

    if (query.format === 'csv') {
      const csv = service.exportToCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="rbac-report-${tenantId}-${Date.now()}.csv"`
      );
      res.status(200).send(csv);
    } else {
      res.status(200).json({
        success: true,
        data: report,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
      });
    } else {
      console.error('Error generating RBAC report:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * GET /api/v1/tenants/:tenantId/reports/quotas
 * Generate quota compliance report
 */
export async function generateQuotaReport(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const query = GenerateReportSchema.parse(req.query);

    const customRange =
      query.period === 'custom' && query.startDate && query.endDate
        ? { start: new Date(query.startDate), end: new Date(query.endDate) }
        : undefined;

    const service = getComplianceService();
    const report = await service.generateQuotaComplianceReport(
      tenantId,
      query.period as ReportPeriod,
      customRange
    );

    if (query.format === 'csv') {
      const csv = service.exportToCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="quota-report-${tenantId}-${Date.now()}.csv"`
      );
      res.status(200).send(csv);
    } else {
      res.status(200).json({
        success: true,
        data: report,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
      });
    } else {
      console.error('Error generating quota report:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * GET /api/v1/tenants/:tenantId/reports/secrets
 * Generate secret access report
 */
export async function generateSecretReport(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const query = GenerateReportSchema.parse(req.query);

    const customRange =
      query.period === 'custom' && query.startDate && query.endDate
        ? { start: new Date(query.startDate), end: new Date(query.endDate) }
        : undefined;

    const service = getComplianceService();
    const report = await service.generateSecretAccessReport(
      tenantId,
      query.period as ReportPeriod,
      customRange
    );

    if (query.format === 'csv') {
      const csv = service.exportToCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="secret-report-${tenantId}-${Date.now()}.csv"`
      );
      res.status(200).send(csv);
    } else {
      res.status(200).json({
        success: true,
        data: report,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
      });
    } else {
      console.error('Error generating secret report:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * GET /api/v1/tenants/:tenantId/reports/high-risk
 * Generate high-risk actions report
 */
export async function generateHighRiskReport(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const query = GenerateReportSchema.parse(req.query);

    const customRange =
      query.period === 'custom' && query.startDate && query.endDate
        ? { start: new Date(query.startDate), end: new Date(query.endDate) }
        : undefined;

    const service = getComplianceService();
    const report = await service.generateHighRiskActionsReport(
      tenantId,
      query.period as ReportPeriod,
      customRange
    );

    if (query.format === 'csv') {
      const csv = service.exportToCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="high-risk-report-${tenantId}-${Date.now()}.csv"`
      );
      res.status(200).send(csv);
    } else {
      res.status(200).json({
        success: true,
        data: report,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Validation Error',
        details: error.errors,
      });
    } else {
      console.error('Error generating high-risk report:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
