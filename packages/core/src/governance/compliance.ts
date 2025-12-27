/**
 * Compliance Reports
 *
 * Epic E: RBAC & Governance
 * Generates compliance-ready reports for access, RBAC, quotas, and secrets.
 *
 * @module @gwi/core/governance/compliance
 */

import {
  type SecurityAuditStore,
  getSecurityAuditStore,
} from '../security/audit/index.js';
import { type QuotaManager } from '../quotas/index.js';
import { scanForSecrets, type SecretFinding } from '../security/secrets.js';
import { createLogger } from '../telemetry/index.js';

const logger = createLogger('compliance');

// =============================================================================
// Report Types
// =============================================================================

/**
 * Report period type
 */
export type ReportPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

/**
 * Export format
 */
export type ExportFormat = 'json' | 'csv';

/**
 * Base report structure
 */
export interface BaseReport {
  reportId: string;
  reportType: string;
  tenantId: string;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
    type: ReportPeriod;
  };
}

/**
 * Access report - who accessed what, when
 */
export interface AccessReport extends BaseReport {
  reportType: 'access';
  summary: {
    totalEvents: number;
    uniqueUsers: number;
    uniqueResources: number;
    byResourceType: Record<string, number>;
  };
  accessLog: Array<{
    timestamp: Date;
    userId: string;
    userEmail?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    outcome: string;
    ipAddress?: string;
  }>;
}

/**
 * RBAC compliance report
 */
export interface RBACComplianceReport extends BaseReport {
  reportType: 'rbac';
  summary: {
    totalRoleAssignments: number;
    totalPermissionChecks: number;
    deniedAttempts: number;
    denialRate: number;
  };
  roleAssignments: Array<{
    userId: string;
    role: string;
    assignedAt?: Date;
    assignedBy?: string;
  }>;
  permissionUsage: Array<{
    action: string;
    totalAttempts: number;
    allowed: number;
    denied: number;
  }>;
  deniedAccess: Array<{
    timestamp: Date;
    userId: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    reason?: string;
  }>;
}

/**
 * Quota compliance report
 */
export interface QuotaComplianceReport extends BaseReport {
  reportType: 'quota';
  summary: {
    totalQuotas: number;
    quotasExceeded: number;
    quotasNearLimit: number;
    averageUtilization: number;
  };
  quotaUsage: Array<{
    resourceType: string;
    limit: number;
    currentUsage: number;
    percentUsed: number;
    status: 'ok' | 'warning' | 'exceeded';
  }>;
  violations: Array<{
    timestamp: Date;
    resourceType: string;
    limit: number;
    attemptedUsage: number;
    action: string;
  }>;
  trends: Array<{
    resourceType: string;
    dailyUsage: Array<{ date: string; usage: number }>;
  }>;
}

/**
 * Secret access report
 */
export interface SecretAccessReport extends BaseReport {
  reportType: 'secret';
  summary: {
    totalSecretAccess: number;
    uniqueSecretsAccessed: number;
    uniqueUsers: number;
    potentialLeaks: number;
  };
  secretAccess: Array<{
    timestamp: Date;
    userId: string;
    secretId: string;
    action: 'accessed' | 'rotated' | 'created' | 'deleted';
    outcome: string;
  }>;
  potentialLeaks: Array<{
    timestamp: Date;
    userId: string;
    finding: SecretFinding;
    context: string;
  }>;
  rotationSchedule: Array<{
    secretId: string;
    lastRotated: Date;
    rotationPeriodDays: number;
    status: 'current' | 'due' | 'overdue';
  }>;
}

/**
 * High-risk actions report
 */
export interface HighRiskActionsReport extends BaseReport {
  reportType: 'high_risk';
  summary: {
    totalHighRiskActions: number;
    byActionType: Record<string, number>;
    byUser: Record<string, number>;
  };
  actions: Array<{
    timestamp: Date;
    userId: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    outcome: string;
    requiresReview: boolean;
  }>;
}

// =============================================================================
// Compliance Service
// =============================================================================

/**
 * Service for generating compliance reports
 */
export class ComplianceService {
  private auditStore: SecurityAuditStore;
  private quotaManager?: QuotaManager;

  constructor(auditStore?: SecurityAuditStore, quotaManager?: QuotaManager) {
    this.auditStore = auditStore || getSecurityAuditStore();
    this.quotaManager = quotaManager;
  }

  /**
   * Generate access report
   */
  async generateAccessReport(
    tenantId: string,
    period: ReportPeriod,
    customRange?: { start: Date; end: Date }
  ): Promise<AccessReport> {
    logger.info('Generating access report', { tenantId, period });

    const { start, end } = this.getPeriodRange(period, customRange);
    const reportId = this.generateReportId('access');

    // Fetch all events for the period
    const events = await this.auditStore.listTenantEvents(tenantId, {
      startTime: start,
      endTime: end,
    });

    // Build access log
    const accessLog = events.map((e) => ({
      timestamp: e.timestamp,
      userId: e.actor.id,
      userEmail: e.actor.email,
      action: String(e.eventType),
      resourceType: e.resource?.type,
      resourceId: e.resource?.id,
      outcome: e.outcome,
      ipAddress: e.actor.ip,
    }));

    // Calculate summary
    const uniqueUsers = new Set(events.map((e) => e.actor.id)).size;
    const uniqueResources = new Set(
      events.filter((e) => e.resource).map((e) => e.resource!.id)
    ).size;

    const byResourceType: Record<string, number> = {};
    for (const event of events) {
      if (event.resource?.type) {
        byResourceType[event.resource.type] = (byResourceType[event.resource.type] || 0) + 1;
      }
    }

    return {
      reportId,
      reportType: 'access',
      tenantId,
      generatedAt: new Date(),
      period: { start, end, type: period },
      summary: {
        totalEvents: events.length,
        uniqueUsers,
        uniqueResources,
        byResourceType,
      },
      accessLog,
    };
  }

  /**
   * Generate RBAC compliance report
   */
  async generateRBACComplianceReport(
    tenantId: string,
    period: ReportPeriod,
    customRange?: { start: Date; end: Date }
  ): Promise<RBACComplianceReport> {
    logger.info('Generating RBAC compliance report', { tenantId, period });

    const { start, end } = this.getPeriodRange(period, customRange);
    const reportId = this.generateReportId('rbac');

    // Fetch RBAC-related events
    const events = await this.auditStore.listTenantEvents(tenantId, {
      startTime: start,
      endTime: end,
    });

    // Filter RBAC events
    const rbacCheckEvents = events.filter((e) =>
      e.eventType.startsWith('rbac.check.')
    );
    const roleChangeEvents = events.filter((e) =>
      e.eventType.startsWith('rbac.role.')
    );

    // Build role assignments
    const roleAssignments: RBACComplianceReport['roleAssignments'] = [];
    for (const event of roleChangeEvents) {
      if (event.eventType === 'rbac.role.assigned' || event.eventType === 'rbac.role.changed') {
        roleAssignments.push({
          userId: String(event.data?.targetUserId || event.resource?.id || 'unknown'),
          role: String(event.data?.role || 'unknown'),
          assignedAt: event.timestamp,
          assignedBy: event.actor.id,
        });
      }
    }

    // Build permission usage stats
    const permissionMap = new Map<
      string,
      { action: string; allowed: number; denied: number }
    >();

    for (const event of rbacCheckEvents) {
      const action = String(event.data?.action || event.eventType);
      const existing = permissionMap.get(action) || { action, allowed: 0, denied: 0 };

      if (event.outcome === 'success') {
        existing.allowed++;
      } else if (event.outcome === 'denied') {
        existing.denied++;
      }

      permissionMap.set(action, existing);
    }

    const permissionUsage = Array.from(permissionMap.values()).map((p) => ({
      ...p,
      totalAttempts: p.allowed + p.denied,
    }));

    // Build denied access log
    const deniedEvents = rbacCheckEvents.filter((e) => e.outcome === 'denied');
    const deniedAccess = deniedEvents.map((e) => ({
      timestamp: e.timestamp,
      userId: e.actor.id,
      action: String(e.data?.action || e.eventType),
      resourceType: e.resource?.type,
      resourceId: e.resource?.id,
      reason: e.error,
    }));

    // Calculate summary
    const totalPermissionChecks = rbacCheckEvents.length;
    const deniedAttempts = deniedEvents.length;
    const denialRate = totalPermissionChecks > 0
      ? (deniedAttempts / totalPermissionChecks) * 100
      : 0;

    return {
      reportId,
      reportType: 'rbac',
      tenantId,
      generatedAt: new Date(),
      period: { start, end, type: period },
      summary: {
        totalRoleAssignments: roleAssignments.length,
        totalPermissionChecks,
        deniedAttempts,
        denialRate,
      },
      roleAssignments,
      permissionUsage,
      deniedAccess,
    };
  }

  /**
   * Generate quota compliance report
   */
  async generateQuotaComplianceReport(
    tenantId: string,
    period: ReportPeriod,
    customRange?: { start: Date; end: Date }
  ): Promise<QuotaComplianceReport> {
    logger.info('Generating quota compliance report', { tenantId, period });

    if (!this.quotaManager) {
      throw new Error('QuotaManager is required for quota compliance reports');
    }

    const { start, end } = this.getPeriodRange(period, customRange);
    const reportId = this.generateReportId('quota');

    // Get quota violations from audit log
    const events = await this.auditStore.listTenantEvents(tenantId, {
      eventType: 'plan.limit.exceeded',
      startTime: start,
      endTime: end,
    });

    // Build violations list
    const violations = events.map((e) => ({
      timestamp: e.timestamp,
      resourceType: String(e.data?.resource || 'unknown'),
      limit: Number(e.data?.limit || 0),
      attemptedUsage: Number(e.data?.current || 0),
      action: String(e.eventType),
    }));

    // Get current quota usage for all resources
    const quotas = await this.quotaManager.listQuotas();
    const quotaUsage: QuotaComplianceReport['quotaUsage'] = [];

    for (const quota of quotas) {
      if (!quota.enabled) continue;

      const usage = await this.quotaManager.getUsage(tenantId, quota.resourceType);

      let status: 'ok' | 'warning' | 'exceeded' = 'ok';
      if (usage.percentUsed >= 100) {
        status = 'exceeded';
      } else if (usage.percentUsed >= 80) {
        status = 'warning';
      }

      quotaUsage.push({
        resourceType: quota.resourceType,
        limit: usage.limit,
        currentUsage: usage.currentUsage,
        percentUsed: usage.percentUsed,
        status,
      });
    }

    // Calculate summary
    const quotasExceeded = quotaUsage.filter((q) => q.status === 'exceeded').length;
    const quotasNearLimit = quotaUsage.filter((q) => q.status === 'warning').length;
    const averageUtilization =
      quotaUsage.length > 0
        ? quotaUsage.reduce((sum, q) => sum + q.percentUsed, 0) / quotaUsage.length
        : 0;

    // Build trends (mock data - would need historical tracking)
    const trends: QuotaComplianceReport['trends'] = [];
    for (const quota of quotas.slice(0, 5)) {
      // Top 5 resources
      trends.push({
        resourceType: quota.resourceType,
        dailyUsage: [], // Would populate with historical data
      });
    }

    return {
      reportId,
      reportType: 'quota',
      tenantId,
      generatedAt: new Date(),
      period: { start, end, type: period },
      summary: {
        totalQuotas: quotas.length,
        quotasExceeded,
        quotasNearLimit,
        averageUtilization,
      },
      quotaUsage,
      violations,
      trends,
    };
  }

  /**
   * Generate secret access report
   */
  async generateSecretAccessReport(
    tenantId: string,
    period: ReportPeriod,
    customRange?: { start: Date; end: Date }
  ): Promise<SecretAccessReport> {
    logger.info('Generating secret access report', { tenantId, period });

    const { start, end } = this.getPeriodRange(period, customRange);
    const reportId = this.generateReportId('secret');

    // Fetch secret-related events
    const events = await this.auditStore.listTenantEvents(tenantId, {
      startTime: start,
      endTime: end,
    });

    const secretEvents = events.filter((e) => e.eventType.startsWith('secret.'));

    // Build secret access log
    const secretAccess = secretEvents.map((e) => ({
      timestamp: e.timestamp,
      userId: e.actor.id,
      secretId: e.resource?.id || 'unknown',
      action: this.extractSecretAction(e.eventType),
      outcome: e.outcome,
    }));

    // Scan for potential secret leaks in audit logs
    const potentialLeaks: SecretAccessReport['potentialLeaks'] = [];
    for (const event of events) {
      if (event.data) {
        const scanResult = scanForSecrets(JSON.stringify(event.data));
        if (scanResult.hasSecrets) {
          for (const finding of scanResult.findings) {
            potentialLeaks.push({
              timestamp: event.timestamp,
              userId: event.actor.id,
              finding,
              context: event.eventType,
            });
          }
        }
      }
    }

    // Build rotation schedule (mock - would need actual secret metadata)
    const rotationSchedule: SecretAccessReport['rotationSchedule'] = [];
    const uniqueSecrets = new Set(secretAccess.map((s) => s.secretId));
    for (const secretId of Array.from(uniqueSecrets)) {
      const rotatedEvents = secretEvents.filter(
        (e) => e.resource?.id === secretId && e.eventType === 'secret.rotated'
      );
      const lastRotated = rotatedEvents.length > 0
        ? rotatedEvents[rotatedEvents.length - 1].timestamp
        : new Date(0);

      const daysSinceRotation = Math.floor(
        (Date.now() - lastRotated.getTime()) / (24 * 60 * 60 * 1000)
      );
      const rotationPeriodDays = 90; // Default rotation period

      let status: 'current' | 'due' | 'overdue' = 'current';
      if (daysSinceRotation >= rotationPeriodDays + 30) {
        status = 'overdue';
      } else if (daysSinceRotation >= rotationPeriodDays) {
        status = 'due';
      }

      rotationSchedule.push({
        secretId,
        lastRotated,
        rotationPeriodDays,
        status,
      });
    }

    return {
      reportId,
      reportType: 'secret',
      tenantId,
      generatedAt: new Date(),
      period: { start, end, type: period },
      summary: {
        totalSecretAccess: secretAccess.length,
        uniqueSecretsAccessed: uniqueSecrets.size,
        uniqueUsers: new Set(secretAccess.map((s) => s.userId)).size,
        potentialLeaks: potentialLeaks.length,
      },
      secretAccess,
      potentialLeaks,
      rotationSchedule,
    };
  }

  /**
   * Generate high-risk actions report
   */
  async generateHighRiskActionsReport(
    tenantId: string,
    period: ReportPeriod,
    customRange?: { start: Date; end: Date }
  ): Promise<HighRiskActionsReport> {
    logger.info('Generating high-risk actions report', { tenantId, period });

    const { start, end } = this.getPeriodRange(period, customRange);
    const reportId = this.generateReportId('high_risk');

    // High-risk event patterns
    const highRiskPatterns = [
      'tenant.delete',
      'tenant.billing',
      'member.update_role',
      'candidate.executed',
      'connector.publish',
      'registry.publish',
      'git.push.executed',
      'git.pr.merged',
    ];

    // Fetch events
    const events = await this.auditStore.listTenantEvents(tenantId, {
      startTime: start,
      endTime: end,
    });

    // Filter high-risk actions
    const highRiskEvents = events.filter((e) =>
      highRiskPatterns.some((pattern) => e.eventType.includes(pattern))
    );

    // Build actions list
    const actions = highRiskEvents.map((e) => ({
      timestamp: e.timestamp,
      userId: e.actor.id,
      action: e.eventType,
      resourceType: e.resource?.type,
      resourceId: e.resource?.id,
      outcome: e.outcome,
      requiresReview: e.outcome === 'failure' || e.outcome === 'error',
    }));

    // Calculate summary
    const byActionType: Record<string, number> = {};
    const byUser: Record<string, number> = {};

    for (const action of actions) {
      byActionType[action.action] = (byActionType[action.action] || 0) + 1;
      byUser[action.userId] = (byUser[action.userId] || 0) + 1;
    }

    return {
      reportId,
      reportType: 'high_risk',
      tenantId,
      generatedAt: new Date(),
      period: { start, end, type: period },
      summary: {
        totalHighRiskActions: actions.length,
        byActionType,
        byUser,
      },
      actions,
    };
  }

  /**
   * Export report to CSV format
   */
  exportToCSV(report: BaseReport): string {
    logger.debug('Exporting report to CSV', { reportId: report.reportId });

    const lines: string[] = [];

    // Header
    lines.push(`# ${report.reportType.toUpperCase()} Report`);
    lines.push(`# Generated: ${report.generatedAt.toISOString()}`);
    lines.push(`# Period: ${report.period.start.toISOString()} to ${report.period.end.toISOString()}`);
    lines.push('');

    // Type-specific export
    switch (report.reportType) {
      case 'access':
        return this.exportAccessReportToCSV(report as AccessReport);
      case 'rbac':
        return this.exportRBACReportToCSV(report as RBACComplianceReport);
      case 'quota':
        return this.exportQuotaReportToCSV(report as QuotaComplianceReport);
      case 'secret':
        return this.exportSecretReportToCSV(report as SecretAccessReport);
      case 'high_risk':
        return this.exportHighRiskReportToCSV(report as HighRiskActionsReport);
      default:
        throw new Error(`Unsupported report type for CSV export: ${report.reportType}`);
    }
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  private getPeriodRange(
    period: ReportPeriod,
    customRange?: { start: Date; end: Date }
  ): { start: Date; end: Date } {
    if (period === 'custom' && customRange) {
      return customRange;
    }

    const end = new Date();
    let start: Date;

    switch (period) {
      case 'day':
        start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return { start, end };
  }

  private generateReportId(type: string): string {
    return `rep-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private extractSecretAction(eventType: string): 'accessed' | 'rotated' | 'created' | 'deleted' {
    if (eventType.includes('accessed')) return 'accessed';
    if (eventType.includes('rotated')) return 'rotated';
    if (eventType.includes('created')) return 'created';
    if (eventType.includes('deleted')) return 'deleted';
    return 'accessed';
  }

  private exportAccessReportToCSV(report: AccessReport): string {
    const lines: string[] = [];
    lines.push('Timestamp,User ID,User Email,Action,Resource Type,Resource ID,Outcome,IP Address');

    for (const entry of report.accessLog) {
      lines.push(
        [
          entry.timestamp.toISOString(),
          this.escapeCsv(entry.userId),
          this.escapeCsv(entry.userEmail || ''),
          this.escapeCsv(entry.action),
          this.escapeCsv(entry.resourceType || ''),
          this.escapeCsv(entry.resourceId || ''),
          entry.outcome,
          this.escapeCsv(entry.ipAddress || ''),
        ].join(',')
      );
    }

    return lines.join('\n');
  }

  private exportRBACReportToCSV(report: RBACComplianceReport): string {
    const lines: string[] = [];

    // Denied access section
    lines.push('# Denied Access Attempts');
    lines.push('Timestamp,User ID,Action,Resource Type,Resource ID,Reason');

    for (const entry of report.deniedAccess) {
      lines.push(
        [
          entry.timestamp.toISOString(),
          this.escapeCsv(entry.userId),
          this.escapeCsv(entry.action),
          this.escapeCsv(entry.resourceType || ''),
          this.escapeCsv(entry.resourceId || ''),
          this.escapeCsv(entry.reason || ''),
        ].join(',')
      );
    }

    return lines.join('\n');
  }

  private exportQuotaReportToCSV(report: QuotaComplianceReport): string {
    const lines: string[] = [];
    lines.push('Resource Type,Limit,Current Usage,Percent Used,Status');

    for (const entry of report.quotaUsage) {
      lines.push(
        [
          this.escapeCsv(entry.resourceType),
          entry.limit.toString(),
          entry.currentUsage.toString(),
          entry.percentUsed.toFixed(2),
          entry.status,
        ].join(',')
      );
    }

    return lines.join('\n');
  }

  private exportSecretReportToCSV(report: SecretAccessReport): string {
    const lines: string[] = [];
    lines.push('Timestamp,User ID,Secret ID,Action,Outcome');

    for (const entry of report.secretAccess) {
      lines.push(
        [
          entry.timestamp.toISOString(),
          this.escapeCsv(entry.userId),
          this.escapeCsv(entry.secretId),
          entry.action,
          entry.outcome,
        ].join(',')
      );
    }

    return lines.join('\n');
  }

  private exportHighRiskReportToCSV(report: HighRiskActionsReport): string {
    const lines: string[] = [];
    lines.push('Timestamp,User ID,Action,Resource Type,Resource ID,Outcome,Requires Review');

    for (const entry of report.actions) {
      lines.push(
        [
          entry.timestamp.toISOString(),
          this.escapeCsv(entry.userId),
          this.escapeCsv(entry.action),
          this.escapeCsv(entry.resourceType || ''),
          this.escapeCsv(entry.resourceId || ''),
          entry.outcome,
          entry.requiresReview.toString(),
        ].join(',')
      );
    }

    return lines.join('\n');
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create compliance service
 */
export function createComplianceService(
  auditStore?: SecurityAuditStore,
  quotaManager?: QuotaManager
): ComplianceService {
  return new ComplianceService(auditStore, quotaManager);
}
