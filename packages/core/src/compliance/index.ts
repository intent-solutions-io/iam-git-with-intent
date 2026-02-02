/**
 * Compliance & Audit Utilities
 *
 * Phase 41: Compliance documentation, controls mapping, and audit export capabilities.
 * EPIC 025: Regulated Domain Controls - Risk tiers, policy gates, and compliance enforcement
 *
 * @module @gwi/core/compliance
 */

import { createLogger } from '../telemetry/index.js';

// =============================================================================
// EPIC 025: Risk Tiers & Policy Gates
// =============================================================================

// Risk tier enforcement exports
export * from './risk-tiers.js';

// Policy gate exports
export * from './policy-gates.js';

// Tamper-evident audit trail exports
export * from './audit-trail.js';

// Note: Secret detection uses existing @gwi/core/security/secrets module
// No separate compliance secret-detector needed - avoid duplication

const logger = createLogger('compliance');

// =============================================================================
// Types
// =============================================================================

/**
 * Compliance framework
 */
export type ComplianceFramework = 'SOC2' | 'GDPR' | 'HIPAA' | 'ISO27001' | 'PCI-DSS';

/**
 * Control status
 */
export type ControlStatus = 'implemented' | 'partial' | 'planned' | 'not_applicable';

/**
 * Control category
 */
export type ControlCategory =
  | 'access_control'
  | 'data_protection'
  | 'logging_monitoring'
  | 'incident_response'
  | 'change_management'
  | 'business_continuity'
  | 'vendor_management'
  | 'security_awareness';

/**
 * Compliance control
 */
export interface ComplianceControl {
  /** Control ID */
  id: string;
  /** Framework this control belongs to */
  framework: ComplianceFramework;
  /** Control category */
  category: ControlCategory;
  /** Control name */
  name: string;
  /** Control description */
  description: string;
  /** Implementation status */
  status: ControlStatus;
  /** Implementation details */
  implementation?: string;
  /** Evidence reference */
  evidenceRef?: string;
  /** Last reviewed date */
  lastReviewed?: Date;
  /** Next review date */
  nextReview?: Date;
  /** Owner */
  owner?: string;
}

/**
 * Compliance report
 */
export interface ComplianceReport {
  /** Report ID */
  id: string;
  /** Tenant ID */
  tenantId: string;
  /** Framework */
  framework: ComplianceFramework;
  /** Generated at */
  generatedAt: Date;
  /** Controls */
  controls: ComplianceControl[];
  /** Summary */
  summary: {
    total: number;
    implemented: number;
    partial: number;
    planned: number;
    notApplicable: number;
    complianceScore: number;
  };
}

/**
 * Compliance audit event type
 */
export type ComplianceAuditEventType =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.failed'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'api_key.create'
  | 'api_key.revoke'
  | 'run.create'
  | 'run.complete'
  | 'run.fail'
  | 'policy.update'
  | 'settings.update'
  | 'data.export'
  | 'data.delete';

/**
 * Compliance audit event
 */
export interface ComplianceAuditEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: ComplianceAuditEventType;
  /** Tenant ID */
  tenantId: string;
  /** Actor (user or system) */
  actor: {
    type: 'user' | 'system' | 'api_key';
    id: string;
    name?: string;
  };
  /** Target resource */
  target?: {
    type: string;
    id: string;
    name?: string;
  };
  /** Action details */
  details?: Record<string, unknown>;
  /** IP address */
  ipAddress?: string;
  /** User agent */
  userAgent?: string;
  /** Timestamp */
  timestamp: Date;
  /** Correlation ID */
  correlationId?: string;
}

/**
 * Audit export format
 */
export type AuditExportFormat = 'json' | 'csv' | 'ndjson';

/**
 * Audit export request
 */
export interface ComplianceAuditExportRequest {
  /** Tenant ID */
  tenantId: string;
  /** Start date */
  startDate: Date;
  /** End date */
  endDate: Date;
  /** Event types filter */
  eventTypes?: ComplianceAuditEventType[];
  /** Format */
  format: AuditExportFormat;
  /** Include details */
  includeDetails: boolean;
}

/**
 * Audit export result
 */
export interface ComplianceAuditExportResult {
  /** Export ID */
  id: string;
  /** Status */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** Download URL (when completed) */
  downloadUrl?: string;
  /** Total events */
  totalEvents: number;
  /** File size bytes */
  fileSizeBytes?: number;
  /** Created at */
  createdAt: Date;
  /** Completed at */
  completedAt?: Date;
  /** Error message */
  error?: string;
}

/**
 * Compliance audit store interface
 */
export interface ComplianceAuditStore {
  record(event: Omit<ComplianceAuditEvent, 'id' | 'timestamp'>): Promise<ComplianceAuditEvent>;
  query(
    tenantId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      eventTypes?: ComplianceAuditEventType[];
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: ComplianceAuditEvent[]; total: number }>;
  export(request: ComplianceAuditExportRequest): Promise<ComplianceAuditExportResult>;
  getExportStatus(exportId: string): Promise<ComplianceAuditExportResult | null>;
}

// =============================================================================
// Default Controls
// =============================================================================

/**
 * SOC2 Trust Services Criteria controls
 */
export const SOC2_CONTROLS: Omit<ComplianceControl, 'status' | 'implementation'>[] = [
  {
    id: 'CC1.1',
    framework: 'SOC2',
    category: 'access_control',
    name: 'Security Policy',
    description: 'Entity demonstrates a commitment to integrity and ethical values.',
  },
  {
    id: 'CC2.1',
    framework: 'SOC2',
    category: 'logging_monitoring',
    name: 'Information Communication',
    description: 'Entity obtains or generates and uses relevant, quality information.',
  },
  {
    id: 'CC3.1',
    framework: 'SOC2',
    category: 'change_management',
    name: 'Risk Assessment',
    description: 'Entity specifies objectives with sufficient clarity.',
  },
  {
    id: 'CC4.1',
    framework: 'SOC2',
    category: 'logging_monitoring',
    name: 'Monitoring Activities',
    description: 'Entity selects, develops, and performs ongoing evaluations.',
  },
  {
    id: 'CC5.1',
    framework: 'SOC2',
    category: 'access_control',
    name: 'Control Activities',
    description: 'Entity selects and develops control activities that contribute to mitigation.',
  },
  {
    id: 'CC6.1',
    framework: 'SOC2',
    category: 'access_control',
    name: 'Logical Access Security',
    description: 'Entity implements logical access security software.',
  },
  {
    id: 'CC6.2',
    framework: 'SOC2',
    category: 'access_control',
    name: 'Access Authentication',
    description: 'Entity requires authentication before system access.',
  },
  {
    id: 'CC6.3',
    framework: 'SOC2',
    category: 'access_control',
    name: 'Access Removal',
    description: 'Entity removes access to protected information when no longer needed.',
  },
  {
    id: 'CC7.1',
    framework: 'SOC2',
    category: 'incident_response',
    name: 'System Operations',
    description: 'Entity uses detection and monitoring procedures.',
  },
  {
    id: 'CC7.2',
    framework: 'SOC2',
    category: 'incident_response',
    name: 'Incident Response',
    description: 'Entity monitors system components and response procedures.',
  },
  {
    id: 'CC8.1',
    framework: 'SOC2',
    category: 'change_management',
    name: 'Change Management',
    description: 'Entity authorizes, designs, and implements changes.',
  },
  {
    id: 'CC9.1',
    framework: 'SOC2',
    category: 'vendor_management',
    name: 'Risk Mitigation',
    description: 'Entity identifies, selects, and develops risk mitigation activities.',
  },
];

/**
 * GDPR Article 5 controls
 */
export const GDPR_CONTROLS: Omit<ComplianceControl, 'status' | 'implementation'>[] = [
  {
    id: 'GDPR-5.1.a',
    framework: 'GDPR',
    category: 'data_protection',
    name: 'Lawfulness, Fairness, Transparency',
    description: 'Personal data processed lawfully, fairly, and transparently.',
  },
  {
    id: 'GDPR-5.1.b',
    framework: 'GDPR',
    category: 'data_protection',
    name: 'Purpose Limitation',
    description: 'Data collected for specified, explicit, and legitimate purposes.',
  },
  {
    id: 'GDPR-5.1.c',
    framework: 'GDPR',
    category: 'data_protection',
    name: 'Data Minimization',
    description: 'Data adequate, relevant, and limited to what is necessary.',
  },
  {
    id: 'GDPR-5.1.d',
    framework: 'GDPR',
    category: 'data_protection',
    name: 'Accuracy',
    description: 'Data accurate and kept up to date.',
  },
  {
    id: 'GDPR-5.1.e',
    framework: 'GDPR',
    category: 'data_protection',
    name: 'Storage Limitation',
    description: 'Data kept no longer than necessary.',
  },
  {
    id: 'GDPR-5.1.f',
    framework: 'GDPR',
    category: 'data_protection',
    name: 'Integrity and Confidentiality',
    description: 'Data processed with appropriate security measures.',
  },
];

// =============================================================================
// In-Memory Audit Store
// =============================================================================

/**
 * In-memory compliance audit store for development
 */
export class InMemoryComplianceAuditStore implements ComplianceAuditStore {
  private events: ComplianceAuditEvent[] = [];
  private exports: Map<string, ComplianceAuditExportResult> = new Map();

  async record(event: Omit<ComplianceAuditEvent, 'id' | 'timestamp'>): Promise<ComplianceAuditEvent> {
    const auditEvent: ComplianceAuditEvent = {
      ...event,
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date(),
    };

    this.events.push(auditEvent);
    logger.debug('Audit event recorded', { type: event.type, tenantId: event.tenantId });

    return auditEvent;
  }

  async query(
    tenantId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      eventTypes?: ComplianceAuditEventType[];
      limit?: number;
      offset?: number;
    }
  ): Promise<{ events: ComplianceAuditEvent[]; total: number }> {
    let filtered = this.events.filter(e => e.tenantId === tenantId);

    if (options.startDate) {
      filtered = filtered.filter(e => e.timestamp >= options.startDate!);
    }

    if (options.endDate) {
      filtered = filtered.filter(e => e.timestamp <= options.endDate!);
    }

    if (options.eventTypes && options.eventTypes.length > 0) {
      filtered = filtered.filter(e => options.eventTypes!.includes(e.type));
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const total = filtered.length;
    const offset = options.offset || 0;
    const limit = options.limit || 100;

    return {
      events: filtered.slice(offset, offset + limit),
      total,
    };
  }

  async export(request: ComplianceAuditExportRequest): Promise<ComplianceAuditExportResult> {
    const id = `export_${Date.now()}`;

    const result: ComplianceAuditExportResult = {
      id,
      status: 'processing',
      totalEvents: 0,
      createdAt: new Date(),
    };

    this.exports.set(id, result);

    // Simulate async export
    const { events } = await this.query(request.tenantId, {
      startDate: request.startDate,
      endDate: request.endDate,
      eventTypes: request.eventTypes,
      limit: 10000,
    });

    result.status = 'completed';
    result.totalEvents = events.length;
    result.completedAt = new Date();
    result.downloadUrl = `/api/audit/exports/${id}/download`;
    result.fileSizeBytes = JSON.stringify(events).length;

    this.exports.set(id, result);

    return result;
  }

  async getExportStatus(exportId: string): Promise<ComplianceAuditExportResult | null> {
    return this.exports.get(exportId) || null;
  }
}

// =============================================================================
// Compliance Manager
// =============================================================================

/**
 * Compliance manager for generating reports and tracking controls
 */
export class ComplianceManager {
  private controls: Map<string, ComplianceControl> = new Map();

  constructor(private tenantId: string) {
    // Initialize with default controls
    for (const control of SOC2_CONTROLS) {
      this.controls.set(control.id, { ...control, status: 'planned' });
    }
    for (const control of GDPR_CONTROLS) {
      this.controls.set(control.id, { ...control, status: 'planned' });
    }
  }

  /**
   * Update control status
   */
  updateControl(
    controlId: string,
    updates: Partial<Pick<ComplianceControl, 'status' | 'implementation' | 'evidenceRef' | 'owner'>>
  ): ComplianceControl {
    const control = this.controls.get(controlId);
    if (!control) {
      throw new Error(`Control not found: ${controlId}`);
    }

    const updated = {
      ...control,
      ...updates,
      lastReviewed: new Date(),
    };

    this.controls.set(controlId, updated);
    return updated;
  }

  /**
   * Get all controls for a framework
   */
  getControls(framework?: ComplianceFramework): ComplianceControl[] {
    const controls = Array.from(this.controls.values());
    return framework ? controls.filter(c => c.framework === framework) : controls;
  }

  /**
   * Generate compliance report
   */
  generateReport(framework: ComplianceFramework): ComplianceReport {
    const controls = this.getControls(framework);

    const summary = {
      total: controls.length,
      implemented: controls.filter(c => c.status === 'implemented').length,
      partial: controls.filter(c => c.status === 'partial').length,
      planned: controls.filter(c => c.status === 'planned').length,
      notApplicable: controls.filter(c => c.status === 'not_applicable').length,
      complianceScore: 0,
    };

    // Calculate compliance score (implemented = 100%, partial = 50%)
    const applicableControls = summary.total - summary.notApplicable;
    if (applicableControls > 0) {
      summary.complianceScore = Math.round(
        ((summary.implemented + summary.partial * 0.5) / applicableControls) * 100
      );
    }

    return {
      id: `report_${Date.now()}`,
      tenantId: this.tenantId,
      framework,
      generatedAt: new Date(),
      controls,
      summary,
    };
  }

  /**
   * Export report to markdown
   */
  reportToMarkdown(report: ComplianceReport): string {
    const lines = [
      `# ${report.framework} Compliance Report`,
      '',
      `**Tenant**: ${report.tenantId}`,
      `**Generated**: ${report.generatedAt.toISOString()}`,
      '',
      '## Summary',
      '',
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Controls | ${report.summary.total} |`,
      `| Implemented | ${report.summary.implemented} |`,
      `| Partial | ${report.summary.partial} |`,
      `| Planned | ${report.summary.planned} |`,
      `| N/A | ${report.summary.notApplicable} |`,
      `| **Compliance Score** | **${report.summary.complianceScore}%** |`,
      '',
      '## Controls',
      '',
    ];

    // Group by category
    const byCategory = new Map<ControlCategory, ComplianceControl[]>();
    for (const control of report.controls) {
      const list = byCategory.get(control.category) || [];
      list.push(control);
      byCategory.set(control.category, list);
    }

    for (const [category, controls] of byCategory) {
      lines.push(`### ${this.formatCategory(category)}`);
      lines.push('');
      lines.push('| ID | Name | Status | Owner |');
      lines.push('|----|------|--------|-------|');

      for (const control of controls) {
        const statusIcon = this.getStatusIcon(control.status);
        lines.push(
          `| ${control.id} | ${control.name} | ${statusIcon} ${control.status} | ${control.owner || '-'} |`
        );
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  private formatCategory(category: ControlCategory): string {
    return category
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private getStatusIcon(status: ControlStatus): string {
    switch (status) {
      case 'implemented':
        return '\u2705';
      case 'partial':
        return '\u26a0\ufe0f';
      case 'planned':
        return '\u23f3';
      case 'not_applicable':
        return '\u2796';
    }
  }
}

// =============================================================================
// Audit Logger
// =============================================================================

/**
 * Audit logger for recording events
 */
export class ComplianceAuditLogger {
  constructor(
    private store: ComplianceAuditStore,
    private tenantId: string
  ) {}

  /**
   * Record an audit event
   */
  async log(
    type: ComplianceAuditEventType,
    actor: ComplianceAuditEvent['actor'],
    target?: ComplianceAuditEvent['target'],
    details?: Record<string, unknown>,
    context?: { ipAddress?: string; userAgent?: string; correlationId?: string }
  ): Promise<ComplianceAuditEvent> {
    return this.store.record({
      type,
      tenantId: this.tenantId,
      actor,
      target,
      details,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      correlationId: context?.correlationId,
    });
  }

  /**
   * Query audit events
   */
  async query(options: {
    startDate?: Date;
    endDate?: Date;
    eventTypes?: ComplianceAuditEventType[];
    limit?: number;
    offset?: number;
  }): Promise<{ events: ComplianceAuditEvent[]; total: number }> {
    return this.store.query(this.tenantId, options);
  }

  /**
   * Export audit log
   */
  async export(
    startDate: Date,
    endDate: Date,
    format: AuditExportFormat = 'json',
    eventTypes?: ComplianceAuditEventType[]
  ): Promise<ComplianceAuditExportResult> {
    return this.store.export({
      tenantId: this.tenantId,
      startDate,
      endDate,
      eventTypes,
      format,
      includeDetails: true,
    });
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a compliance manager
 */
export function createComplianceManager(tenantId: string): ComplianceManager {
  return new ComplianceManager(tenantId);
}

/**
 * Create an audit logger with in-memory storage
 */
export function createComplianceAuditLogger(tenantId: string): ComplianceAuditLogger {
  const store = new InMemoryComplianceAuditStore();
  return new ComplianceAuditLogger(store, tenantId);
}

// =============================================================================
// Export Utilities
// =============================================================================

/**
 * Convert audit events to CSV
 */
export function auditEventsToCsv(events: ComplianceAuditEvent[]): string {
  const headers = ['id', 'type', 'timestamp', 'actor_type', 'actor_id', 'target_type', 'target_id', 'ip_address'];
  const lines = [headers.join(',')];

  for (const event of events) {
    const row = [
      event.id,
      event.type,
      event.timestamp.toISOString(),
      event.actor.type,
      event.actor.id,
      event.target?.type || '',
      event.target?.id || '',
      event.ipAddress || '',
    ];
    lines.push(row.map(v => `"${v}"`).join(','));
  }

  return lines.join('\n');
}

/**
 * Convert audit events to NDJSON
 */
export function auditEventsToNdjson(events: ComplianceAuditEvent[]): string {
  return events.map(e => JSON.stringify(e)).join('\n');
}
