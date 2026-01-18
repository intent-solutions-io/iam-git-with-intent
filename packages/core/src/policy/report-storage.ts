/**
 * Report Storage Service
 *
 * Epic D: Policy & Audit - Story D4: Compliance Reports
 * Task D4.5: Implement report storage
 *
 * Provides persistence for compliance reports with support for
 * signed reports, versioning, and tenant isolation.
 *
 * @module @gwi/core/policy/report-storage
 */

import { z } from 'zod';
import type { ComplianceReportTemplate } from './report-templates.js';
import type { SignedReport, ReportSignature } from './report-signing.js';

// =============================================================================
// Types and Schemas
// =============================================================================

/**
 * Report status
 */
export const ReportStatus = z.enum([
  'draft',           // Initial creation, not finalized
  'pending_review',  // Awaiting review/approval
  'approved',        // Approved and signed
  'published',       // Made available externally
  'archived',        // No longer active but retained
  'superseded',      // Replaced by a newer version
]);
export type ReportStatus = z.infer<typeof ReportStatus>;

/**
 * Report metadata for storage
 */
export const StoredReportMetadata = z.object({
  /** Report ID */
  reportId: z.string(),
  /** Tenant ID */
  tenantId: z.string(),
  /** Report version */
  version: z.string(),
  /** Framework identifier */
  framework: z.string(),
  /** Report title */
  title: z.string(),
  /** Report status */
  status: ReportStatus,
  /** Period start date */
  periodStart: z.date(),
  /** Period end date */
  periodEnd: z.date(),
  /** Organization name */
  organizationName: z.string(),
  /** Whether report is signed */
  signed: z.boolean(),
  /** Signer ID if signed */
  signerId: z.string().optional(),
  /** Signature timestamp if signed */
  signedAt: z.date().optional(),
  /** Created timestamp */
  createdAt: z.date(),
  /** Last updated timestamp */
  updatedAt: z.date(),
  /** Created by user ID */
  createdBy: z.string(),
  /** Last updated by user ID */
  updatedBy: z.string().optional(),
  /** Tags for categorization */
  tags: z.array(z.string()).default([]),
  /** Custom metadata */
  customMetadata: z.record(z.unknown()).optional(),
});
export type StoredReportMetadata = z.infer<typeof StoredReportMetadata>;

/**
 * Stored report entry
 */
export const StoredReport = z.object({
  /** Metadata */
  metadata: StoredReportMetadata,
  /** Full report content */
  report: z.custom<ComplianceReportTemplate>(),
  /** Signature if signed */
  signature: z.custom<ReportSignature>().optional(),
  /** JSON content for indexing/search */
  contentJson: z.string().optional(),
  /** Markdown content if generated */
  contentMarkdown: z.string().optional(),
});
export type StoredReport = z.infer<typeof StoredReport>;

/**
 * Report query options
 */
export const ReportQueryOptions = z.object({
  /** Filter by tenant ID */
  tenantId: z.string(),
  /** Filter by status */
  status: ReportStatus.optional(),
  /** Filter by statuses (multiple) */
  statuses: z.array(ReportStatus).optional(),
  /** Filter by framework */
  framework: z.string().optional(),
  /** Filter by period start (after) */
  periodStartAfter: z.date().optional(),
  /** Filter by period start (before) */
  periodStartBefore: z.date().optional(),
  /** Filter by signed status */
  signed: z.boolean().optional(),
  /** Filter by tags (any match) */
  tags: z.array(z.string()).optional(),
  /** Filter by created after */
  createdAfter: z.date().optional(),
  /** Filter by created before */
  createdBefore: z.date().optional(),
  /** Sort field */
  sortBy: z.enum(['createdAt', 'updatedAt', 'periodStart', 'title']).default('createdAt'),
  /** Sort direction */
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  /** Maximum results */
  limit: z.number().min(1).max(1000).default(100),
  /** Offset for pagination */
  offset: z.number().min(0).default(0),
});
export type ReportQueryOptions = z.infer<typeof ReportQueryOptions>;

/**
 * Report query result
 */
export const ReportQueryResult = z.object({
  /** Matching reports (metadata only for list operations) */
  reports: z.array(StoredReportMetadata),
  /** Total count (for pagination) */
  totalCount: z.number(),
  /** Whether there are more results */
  hasMore: z.boolean(),
  /** Query that was executed */
  query: ReportQueryOptions,
});
export type ReportQueryResult = z.infer<typeof ReportQueryResult>;

/**
 * Version history entry
 */
export const ReportVersionEntry = z.object({
  /** Version string */
  version: z.string(),
  /** Report ID */
  reportId: z.string(),
  /** Created timestamp */
  createdAt: z.date(),
  /** Created by */
  createdBy: z.string(),
  /** Change description */
  changeDescription: z.string().optional(),
  /** Status at this version */
  status: ReportStatus,
});
export type ReportVersionEntry = z.infer<typeof ReportVersionEntry>;

// =============================================================================
// Storage Interface
// =============================================================================

/**
 * Report store interface
 */
export interface ReportStore {
  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Save a report (create or update)
   */
  save(
    tenantId: string,
    report: ComplianceReportTemplate,
    options?: {
      status?: ReportStatus;
      createdBy: string;
      tags?: string[];
      customMetadata?: Record<string, unknown>;
    }
  ): Promise<StoredReport>;

  /**
   * Save a signed report
   */
  saveSigned(
    tenantId: string,
    signedReport: SignedReport,
    options?: {
      status?: ReportStatus;
      createdBy: string;
      tags?: string[];
      customMetadata?: Record<string, unknown>;
    }
  ): Promise<StoredReport>;

  /**
   * Get a report by ID
   */
  get(tenantId: string, reportId: string): Promise<StoredReport | null>;

  /**
   * Get report metadata only (lighter weight)
   */
  getMetadata(tenantId: string, reportId: string): Promise<StoredReportMetadata | null>;

  /**
   * Delete a report
   */
  delete(tenantId: string, reportId: string): Promise<boolean>;

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * List reports matching query criteria
   */
  list(options: ReportQueryOptions): Promise<ReportQueryResult>;

  /**
   * Count reports matching query criteria
   */
  count(options: Omit<ReportQueryOptions, 'limit' | 'offset' | 'sortBy' | 'sortDirection'>): Promise<number>;

  // ==========================================================================
  // Status Operations
  // ==========================================================================

  /**
   * Update report status
   */
  updateStatus(
    tenantId: string,
    reportId: string,
    status: ReportStatus,
    updatedBy: string
  ): Promise<StoredReport | null>;

  // ==========================================================================
  // Version Operations
  // ==========================================================================

  /**
   * Create a new version of a report
   */
  createVersion(
    tenantId: string,
    reportId: string,
    report: ComplianceReportTemplate,
    options: {
      createdBy: string;
      changeDescription?: string;
    }
  ): Promise<StoredReport>;

  /**
   * Get version history for a report
   */
  getVersionHistory(tenantId: string, reportId: string): Promise<ReportVersionEntry[]>;

  /**
   * Get a specific version
   */
  getVersion(tenantId: string, reportId: string, version: string): Promise<StoredReport | null>;

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Archive old reports
   */
  archiveOlderThan(
    tenantId: string,
    date: Date,
    options?: { excludeStatuses?: ReportStatus[] }
  ): Promise<number>;

  /**
   * Get reports by IDs
   */
  getMany(tenantId: string, reportIds: string[]): Promise<StoredReport[]>;
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * In-memory report store for testing and development
 */
export class InMemoryReportStore implements ReportStore {
  private reports = new Map<string, StoredReport>();
  private tenantReports = new Map<string, Set<string>>();
  private versions = new Map<string, StoredReport[]>();

  private getKey(tenantId: string, reportId: string): string {
    return `${tenantId}:${reportId}`;
  }

  private getVersionKey(tenantId: string, reportId: string): string {
    return `${tenantId}:${reportId}:versions`;
  }

  private extractFramework(report: ComplianceReportTemplate): string {
    if (typeof report.framework === 'string') {
      return report.framework;
    }
    return report.framework.framework || 'custom';
  }

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  async save(
    tenantId: string,
    report: ComplianceReportTemplate,
    options?: {
      status?: ReportStatus;
      createdBy: string;
      tags?: string[];
      customMetadata?: Record<string, unknown>;
    }
  ): Promise<StoredReport> {
    const now = new Date();
    const key = this.getKey(tenantId, report.reportId);

    const existing = this.reports.get(key);

    const metadata: StoredReportMetadata = {
      reportId: report.reportId,
      tenantId,
      version: report.version,
      framework: this.extractFramework(report),
      title: report.title,
      status: options?.status ?? 'draft',
      periodStart: report.period.start,
      periodEnd: report.period.end,
      organizationName: report.organizationName,
      signed: false,
      createdAt: existing?.metadata.createdAt ?? now,
      updatedAt: now,
      createdBy: existing?.metadata.createdBy ?? options?.createdBy ?? 'unknown',
      updatedBy: options?.createdBy,
      tags: options?.tags ?? existing?.metadata.tags ?? [],
      customMetadata: options?.customMetadata ?? existing?.metadata.customMetadata,
    };

    const storedReport: StoredReport = {
      metadata,
      report,
      contentJson: JSON.stringify(report),
    };

    this.reports.set(key, storedReport);

    // Track by tenant
    let tenantSet = this.tenantReports.get(tenantId);
    if (!tenantSet) {
      tenantSet = new Set();
      this.tenantReports.set(tenantId, tenantSet);
    }
    tenantSet.add(report.reportId);

    return storedReport;
  }

  async saveSigned(
    tenantId: string,
    signedReport: SignedReport,
    options?: {
      status?: ReportStatus;
      createdBy: string;
      tags?: string[];
      customMetadata?: Record<string, unknown>;
    }
  ): Promise<StoredReport> {
    const now = new Date();
    const { report, signature, content } = signedReport;
    const key = this.getKey(tenantId, report.reportId);

    const existing = this.reports.get(key);

    const metadata: StoredReportMetadata = {
      reportId: report.reportId,
      tenantId,
      version: report.version,
      framework: this.extractFramework(report),
      title: report.title,
      status: options?.status ?? 'approved',
      periodStart: report.period.start,
      periodEnd: report.period.end,
      organizationName: report.organizationName,
      signed: true,
      signerId: signature.signer.signerId,
      signedAt: signature.signedAt,
      createdAt: existing?.metadata.createdAt ?? now,
      updatedAt: now,
      createdBy: existing?.metadata.createdBy ?? options?.createdBy ?? 'unknown',
      updatedBy: options?.createdBy,
      tags: options?.tags ?? existing?.metadata.tags ?? [],
      customMetadata: options?.customMetadata ?? existing?.metadata.customMetadata,
    };

    const storedReport: StoredReport = {
      metadata,
      report,
      signature,
      contentJson: content,
    };

    this.reports.set(key, storedReport);

    // Track by tenant
    let tenantSet = this.tenantReports.get(tenantId);
    if (!tenantSet) {
      tenantSet = new Set();
      this.tenantReports.set(tenantId, tenantSet);
    }
    tenantSet.add(report.reportId);

    return storedReport;
  }

  async get(tenantId: string, reportId: string): Promise<StoredReport | null> {
    const key = this.getKey(tenantId, reportId);
    return this.reports.get(key) ?? null;
  }

  async getMetadata(tenantId: string, reportId: string): Promise<StoredReportMetadata | null> {
    const report = await this.get(tenantId, reportId);
    return report?.metadata ?? null;
  }

  async delete(tenantId: string, reportId: string): Promise<boolean> {
    const key = this.getKey(tenantId, reportId);
    const existed = this.reports.has(key);

    this.reports.delete(key);
    this.versions.delete(this.getVersionKey(tenantId, reportId));

    const tenantSet = this.tenantReports.get(tenantId);
    if (tenantSet) {
      tenantSet.delete(reportId);
    }

    return existed;
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  async list(options: ReportQueryOptions): Promise<ReportQueryResult> {
    const validated = ReportQueryOptions.parse(options);
    const { tenantId, limit, offset, sortBy, sortDirection } = validated;

    // Get all tenant reports
    const tenantSet = this.tenantReports.get(tenantId);
    if (!tenantSet) {
      return {
        reports: [],
        totalCount: 0,
        hasMore: false,
        query: validated,
      };
    }

    // Filter reports
    let reports: StoredReportMetadata[] = [];
    for (const reportId of tenantSet) {
      const key = this.getKey(tenantId, reportId);
      const stored = this.reports.get(key);
      if (stored && this.matchesQuery(stored.metadata, validated)) {
        reports.push(stored.metadata);
      }
    }

    // Sort
    reports.sort((a, b) => {
      let aVal: Date | string;
      let bVal: Date | string;

      switch (sortBy) {
        case 'createdAt':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case 'updatedAt':
          aVal = a.updatedAt;
          bVal = b.updatedAt;
          break;
        case 'periodStart':
          aVal = a.periodStart;
          bVal = b.periodStart;
          break;
        case 'title':
          aVal = a.title;
          bVal = b.title;
          break;
        default:
          aVal = a.createdAt;
          bVal = b.createdAt;
      }

      if (aVal instanceof Date && bVal instanceof Date) {
        return sortDirection === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }

      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    const totalCount = reports.length;
    const hasMore = offset + limit < totalCount;

    // Paginate
    reports = reports.slice(offset, offset + limit);

    return {
      reports,
      totalCount,
      hasMore,
      query: validated,
    };
  }

  private matchesQuery(metadata: StoredReportMetadata, options: ReportQueryOptions): boolean {
    // Status filter
    if (options.status && metadata.status !== options.status) {
      return false;
    }

    // Multiple statuses filter
    if (options.statuses && options.statuses.length > 0) {
      if (!options.statuses.includes(metadata.status)) {
        return false;
      }
    }

    // Framework filter
    if (options.framework && metadata.framework !== options.framework) {
      return false;
    }

    // Period filters
    if (options.periodStartAfter && metadata.periodStart < options.periodStartAfter) {
      return false;
    }
    if (options.periodStartBefore && metadata.periodStart > options.periodStartBefore) {
      return false;
    }

    // Signed filter
    if (options.signed !== undefined && metadata.signed !== options.signed) {
      return false;
    }

    // Tags filter (any match)
    if (options.tags && options.tags.length > 0) {
      const hasMatchingTag = options.tags.some(tag => metadata.tags.includes(tag));
      if (!hasMatchingTag) {
        return false;
      }
    }

    // Created date filters
    if (options.createdAfter && metadata.createdAt < options.createdAfter) {
      return false;
    }
    if (options.createdBefore && metadata.createdAt > options.createdBefore) {
      return false;
    }

    return true;
  }

  async count(
    options: Omit<ReportQueryOptions, 'limit' | 'offset' | 'sortBy' | 'sortDirection'>
  ): Promise<number> {
    const result = await this.list({
      ...options,
      limit: 1000,
      offset: 0,
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
    return result.totalCount;
  }

  // ==========================================================================
  // Status Operations
  // ==========================================================================

  async updateStatus(
    tenantId: string,
    reportId: string,
    status: ReportStatus,
    updatedBy: string
  ): Promise<StoredReport | null> {
    const key = this.getKey(tenantId, reportId);
    const existing = this.reports.get(key);

    if (!existing) {
      return null;
    }

    const updated: StoredReport = {
      ...existing,
      metadata: {
        ...existing.metadata,
        status,
        updatedAt: new Date(),
        updatedBy,
      },
    };

    this.reports.set(key, updated);
    return updated;
  }

  // ==========================================================================
  // Version Operations
  // ==========================================================================

  async createVersion(
    tenantId: string,
    reportId: string,
    report: ComplianceReportTemplate,
    options: {
      createdBy: string;
      changeDescription?: string;
    }
  ): Promise<StoredReport> {
    const versionKey = this.getVersionKey(tenantId, reportId);

    // Get existing report
    const existing = await this.get(tenantId, reportId);

    // Store current version in history
    if (existing) {
      let history = this.versions.get(versionKey) ?? [];
      history.push(existing);
      this.versions.set(versionKey, history);
    }

    // Save new version
    const saved = await this.save(tenantId, report, {
      createdBy: options.createdBy,
      status: existing?.metadata.status ?? 'draft',
      tags: existing?.metadata.tags,
      customMetadata: existing?.metadata.customMetadata,
    });

    return saved;
  }

  async getVersionHistory(tenantId: string, reportId: string): Promise<ReportVersionEntry[]> {
    const versionKey = this.getVersionKey(tenantId, reportId);
    const history = this.versions.get(versionKey) ?? [];

    // Get current version
    const current = await this.get(tenantId, reportId);

    const entries: ReportVersionEntry[] = history.map(stored => ({
      version: stored.metadata.version,
      reportId: stored.metadata.reportId,
      createdAt: stored.metadata.createdAt,
      createdBy: stored.metadata.createdBy,
      status: stored.metadata.status,
    }));

    // Add current version
    if (current) {
      entries.push({
        version: current.metadata.version,
        reportId: current.metadata.reportId,
        createdAt: current.metadata.createdAt,
        createdBy: current.metadata.createdBy,
        status: current.metadata.status,
      });
    }

    // Sort by creation date
    entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return entries;
  }

  async getVersion(
    tenantId: string,
    reportId: string,
    version: string
  ): Promise<StoredReport | null> {
    // Check current version
    const current = await this.get(tenantId, reportId);
    if (current && current.metadata.version === version) {
      return current;
    }

    // Check history
    const versionKey = this.getVersionKey(tenantId, reportId);
    const history = this.versions.get(versionKey) ?? [];

    return history.find(stored => stored.metadata.version === version) ?? null;
  }

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  async archiveOlderThan(
    tenantId: string,
    date: Date,
    options?: { excludeStatuses?: ReportStatus[] }
  ): Promise<number> {
    const tenantSet = this.tenantReports.get(tenantId);
    if (!tenantSet) {
      return 0;
    }

    let archivedCount = 0;
    const excludeStatuses = options?.excludeStatuses ?? [];

    for (const reportId of tenantSet) {
      const key = this.getKey(tenantId, reportId);
      const stored = this.reports.get(key);

      if (
        stored &&
        stored.metadata.createdAt < date &&
        stored.metadata.status !== 'archived' &&
        !excludeStatuses.includes(stored.metadata.status)
      ) {
        await this.updateStatus(tenantId, reportId, 'archived', 'system');
        archivedCount++;
      }
    }

    return archivedCount;
  }

  async getMany(tenantId: string, reportIds: string[]): Promise<StoredReport[]> {
    const results: StoredReport[] = [];

    for (const reportId of reportIds) {
      const report = await this.get(tenantId, reportId);
      if (report) {
        results.push(report);
      }
    }

    return results;
  }

  // ==========================================================================
  // Test Helpers
  // ==========================================================================

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.reports.clear();
    this.tenantReports.clear();
    this.versions.clear();
  }

  /**
   * Get total report count (for testing)
   */
  getTotalCount(): number {
    return this.reports.size;
  }
}

// =============================================================================
// Firestore Implementation
// =============================================================================

/**
 * Firestore collection names
 */
export const REPORT_COLLECTIONS = {
  reports: 'compliance_reports',
  versions: 'compliance_report_versions',
} as const;

/**
 * Firestore-based report store
 */
export class FirestoreReportStore implements ReportStore {
  private db: FirebaseFirestore.Firestore;

  constructor(db: FirebaseFirestore.Firestore) {
    this.db = db;
  }

  private getReportRef(tenantId: string, reportId: string) {
    return this.db
      .collection(REPORT_COLLECTIONS.reports)
      .doc(tenantId)
      .collection('reports')
      .doc(reportId);
  }

  private getVersionsRef(tenantId: string, reportId: string) {
    return this.db
      .collection(REPORT_COLLECTIONS.versions)
      .doc(tenantId)
      .collection('reports')
      .doc(reportId)
      .collection('versions');
  }

  private extractFramework(report: ComplianceReportTemplate): string {
    if (typeof report.framework === 'string') {
      return report.framework;
    }
    return report.framework.framework || 'custom';
  }

  // Convert Firestore timestamps to Dates
  private convertTimestamps(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'toDate' in value) {
        result[key] = (value as { toDate: () => Date }).toDate();
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.convertTimestamps(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  async save(
    tenantId: string,
    report: ComplianceReportTemplate,
    options?: {
      status?: ReportStatus;
      createdBy: string;
      tags?: string[];
      customMetadata?: Record<string, unknown>;
    }
  ): Promise<StoredReport> {
    const ref = this.getReportRef(tenantId, report.reportId);

    // Use transaction to avoid race conditions in read-modify-write
    return this.db.runTransaction(async (transaction) => {
      const now = new Date();
      const existing = await transaction.get(ref);

      const metadata: StoredReportMetadata = {
        reportId: report.reportId,
        tenantId,
        version: report.version,
        framework: this.extractFramework(report),
        title: report.title,
        status: options?.status ?? 'draft',
        periodStart: report.period.start,
        periodEnd: report.period.end,
        organizationName: report.organizationName,
        signed: false,
        createdAt: existing.exists ? existing.data()?.metadata?.createdAt?.toDate() ?? now : now,
        updatedAt: now,
        createdBy: existing.exists ? existing.data()?.metadata?.createdBy : options?.createdBy ?? 'unknown',
        updatedBy: options?.createdBy,
        tags: options?.tags ?? [],
        customMetadata: options?.customMetadata,
      };

      const storedReport: StoredReport = {
        metadata,
        report,
        contentJson: JSON.stringify(report),
      };

      transaction.set(ref, storedReport);

      return storedReport;
    });
  }

  async saveSigned(
    tenantId: string,
    signedReport: SignedReport,
    options?: {
      status?: ReportStatus;
      createdBy: string;
      tags?: string[];
      customMetadata?: Record<string, unknown>;
    }
  ): Promise<StoredReport> {
    const { report, signature, content } = signedReport;
    const ref = this.getReportRef(tenantId, report.reportId);

    // Use transaction to avoid race conditions in read-modify-write
    return this.db.runTransaction(async (transaction) => {
      const now = new Date();
      const existing = await transaction.get(ref);

      const metadata: StoredReportMetadata = {
        reportId: report.reportId,
        tenantId,
        version: report.version,
        framework: this.extractFramework(report),
        title: report.title,
        status: options?.status ?? 'approved',
        periodStart: report.period.start,
        periodEnd: report.period.end,
        organizationName: report.organizationName,
        signed: true,
        signerId: signature.signer.signerId,
        signedAt: signature.signedAt,
        createdAt: existing.exists ? existing.data()?.metadata?.createdAt?.toDate() ?? now : now,
        updatedAt: now,
        createdBy: existing.exists ? existing.data()?.metadata?.createdBy : options?.createdBy ?? 'unknown',
        updatedBy: options?.createdBy,
        tags: options?.tags ?? [],
        customMetadata: options?.customMetadata,
      };

      const storedReport: StoredReport = {
        metadata,
        report,
        signature,
        contentJson: content,
      };

      transaction.set(ref, storedReport);

      return storedReport;
    });
  }

  async get(tenantId: string, reportId: string): Promise<StoredReport | null> {
    const ref = this.getReportRef(tenantId, reportId);
    const doc = await ref.get();

    if (!doc.exists) {
      return null;
    }

    const data = this.convertTimestamps(doc.data() as Record<string, unknown>) as StoredReport;
    return data;
  }

  async getMetadata(tenantId: string, reportId: string): Promise<StoredReportMetadata | null> {
    const report = await this.get(tenantId, reportId);
    return report?.metadata ?? null;
  }

  async delete(tenantId: string, reportId: string): Promise<boolean> {
    const ref = this.getReportRef(tenantId, reportId);
    const doc = await ref.get();

    if (!doc.exists) {
      return false;
    }

    await ref.delete();

    // Also delete versions
    const versionsRef = this.getVersionsRef(tenantId, reportId);
    const versions = await versionsRef.get();
    const batch = this.db.batch();
    versions.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return true;
  }

  async list(options: ReportQueryOptions): Promise<ReportQueryResult> {
    const validated = ReportQueryOptions.parse(options);
    const { tenantId, limit, offset, sortBy, sortDirection } = validated;

    let query: FirebaseFirestore.Query = this.db
      .collection(REPORT_COLLECTIONS.reports)
      .doc(tenantId)
      .collection('reports');

    // Apply filters
    if (validated.status) {
      query = query.where('metadata.status', '==', validated.status);
    }

    if (validated.framework) {
      query = query.where('metadata.framework', '==', validated.framework);
    }

    if (validated.signed !== undefined) {
      query = query.where('metadata.signed', '==', validated.signed);
    }

    // Sort
    const sortField = `metadata.${sortBy}`;
    query = query.orderBy(sortField, sortDirection);

    // Execute query
    const snapshot = await query.get();

    // Manual filtering for complex conditions not supported by Firestore
    let reports = snapshot.docs
      .map(doc => this.convertTimestamps(doc.data() as Record<string, unknown>) as StoredReport)
      .filter(stored => this.matchesQuery(stored.metadata, validated))
      .map(stored => stored.metadata);

    const totalCount = reports.length;
    const hasMore = offset + limit < totalCount;

    // Paginate
    reports = reports.slice(offset, offset + limit);

    return {
      reports,
      totalCount,
      hasMore,
      query: validated,
    };
  }

  private matchesQuery(metadata: StoredReportMetadata, options: ReportQueryOptions): boolean {
    // Multiple statuses filter
    if (options.statuses && options.statuses.length > 0) {
      if (!options.statuses.includes(metadata.status)) {
        return false;
      }
    }

    // Period filters
    if (options.periodStartAfter && metadata.periodStart < options.periodStartAfter) {
      return false;
    }
    if (options.periodStartBefore && metadata.periodStart > options.periodStartBefore) {
      return false;
    }

    // Tags filter (any match)
    if (options.tags && options.tags.length > 0) {
      const hasMatchingTag = options.tags.some(tag => metadata.tags.includes(tag));
      if (!hasMatchingTag) {
        return false;
      }
    }

    // Created date filters
    if (options.createdAfter && metadata.createdAt < options.createdAfter) {
      return false;
    }
    if (options.createdBefore && metadata.createdAt > options.createdBefore) {
      return false;
    }

    return true;
  }

  async count(
    options: Omit<ReportQueryOptions, 'limit' | 'offset' | 'sortBy' | 'sortDirection'>
  ): Promise<number> {
    const result = await this.list({
      ...options,
      limit: 1000,
      offset: 0,
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
    return result.totalCount;
  }

  async updateStatus(
    tenantId: string,
    reportId: string,
    status: ReportStatus,
    updatedBy: string
  ): Promise<StoredReport | null> {
    const ref = this.getReportRef(tenantId, reportId);
    const doc = await ref.get();

    if (!doc.exists) {
      return null;
    }

    await ref.update({
      'metadata.status': status,
      'metadata.updatedAt': new Date(),
      'metadata.updatedBy': updatedBy,
    });

    return this.get(tenantId, reportId);
  }

  async createVersion(
    tenantId: string,
    reportId: string,
    report: ComplianceReportTemplate,
    options: {
      createdBy: string;
      changeDescription?: string;
    }
  ): Promise<StoredReport> {
    // Get existing report
    const existing = await this.get(tenantId, reportId);

    // Store current version in history
    if (existing) {
      const versionsRef = this.getVersionsRef(tenantId, reportId);
      await versionsRef.doc(existing.metadata.version).set(existing);
    }

    // Save new version
    return this.save(tenantId, report, {
      createdBy: options.createdBy,
      status: existing?.metadata.status ?? 'draft',
      tags: existing?.metadata.tags,
      customMetadata: existing?.metadata.customMetadata,
    });
  }

  async getVersionHistory(tenantId: string, reportId: string): Promise<ReportVersionEntry[]> {
    const versionsRef = this.getVersionsRef(tenantId, reportId);
    const snapshot = await versionsRef.orderBy('metadata.createdAt').get();

    const entries: ReportVersionEntry[] = snapshot.docs.map(doc => {
      const data = this.convertTimestamps(doc.data() as Record<string, unknown>) as StoredReport;
      return {
        version: data.metadata.version,
        reportId: data.metadata.reportId,
        createdAt: data.metadata.createdAt,
        createdBy: data.metadata.createdBy,
        status: data.metadata.status,
      };
    });

    // Add current version
    const current = await this.get(tenantId, reportId);
    if (current) {
      entries.push({
        version: current.metadata.version,
        reportId: current.metadata.reportId,
        createdAt: current.metadata.createdAt,
        createdBy: current.metadata.createdBy,
        status: current.metadata.status,
      });
    }

    return entries;
  }

  async getVersion(
    tenantId: string,
    reportId: string,
    version: string
  ): Promise<StoredReport | null> {
    // Check current version
    const current = await this.get(tenantId, reportId);
    if (current && current.metadata.version === version) {
      return current;
    }

    // Check history
    const versionsRef = this.getVersionsRef(tenantId, reportId);
    const doc = await versionsRef.doc(version).get();

    if (!doc.exists) {
      return null;
    }

    return this.convertTimestamps(doc.data() as Record<string, unknown>) as StoredReport;
  }

  async archiveOlderThan(
    tenantId: string,
    date: Date,
    options?: { excludeStatuses?: ReportStatus[] }
  ): Promise<number> {
    const excludeStatuses = options?.excludeStatuses ?? [];

    let query: FirebaseFirestore.Query = this.db
      .collection(REPORT_COLLECTIONS.reports)
      .doc(tenantId)
      .collection('reports')
      .where('metadata.createdAt', '<', date);

    const snapshot = await query.get();

    let archivedCount = 0;
    const batch = this.db.batch();

    for (const doc of snapshot.docs) {
      const data = doc.data() as StoredReport;
      if (
        data.metadata.status !== 'archived' &&
        !excludeStatuses.includes(data.metadata.status)
      ) {
        batch.update(doc.ref, {
          'metadata.status': 'archived',
          'metadata.updatedAt': new Date(),
          'metadata.updatedBy': 'system',
        });
        archivedCount++;
      }
    }

    await batch.commit();

    return archivedCount;
  }

  async getMany(tenantId: string, reportIds: string[]): Promise<StoredReport[]> {
    const results: StoredReport[] = [];

    // Firestore limits batched reads, so we fetch one by one
    for (const reportId of reportIds) {
      const report = await this.get(tenantId, reportId);
      if (report) {
        results.push(report);
      }
    }

    return results;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an in-memory report store
 */
export function createInMemoryReportStore(): InMemoryReportStore {
  return new InMemoryReportStore();
}

/**
 * Create a Firestore report store
 */
export function createFirestoreReportStore(
  db: FirebaseFirestore.Firestore
): FirestoreReportStore {
  return new FirestoreReportStore(db);
}

// =============================================================================
// Singleton Management
// =============================================================================

let globalReportStore: ReportStore | null = null;

/**
 * Get the global report store
 */
export function getReportStore(): ReportStore {
  if (!globalReportStore) {
    throw new Error('Report store not initialized. Call setReportStore first.');
  }
  return globalReportStore;
}

/**
 * Set the global report store
 */
export function setReportStore(store: ReportStore): void {
  globalReportStore = store;
}

/**
 * Reset the global report store
 */
export function resetReportStore(): void {
  globalReportStore = null;
}

/**
 * Initialize with in-memory store
 */
export function initializeInMemoryReportStore(): InMemoryReportStore {
  const store = createInMemoryReportStore();
  globalReportStore = store;
  return store;
}

/**
 * Initialize with Firestore store
 */
export function initializeFirestoreReportStore(
  db: FirebaseFirestore.Firestore
): FirestoreReportStore {
  const store = createFirestoreReportStore(db);
  globalReportStore = store;
  return store;
}
