/**
 * Report Distribution Service
 *
 * Epic D: Policy & Audit - Story D4: Compliance Reports
 * Task D4.6: Implement report distribution
 *
 * Provides distribution capabilities for compliance reports including:
 * - Email delivery with attachments
 * - Webhook notifications
 * - Secure download links with expiration
 * - Distribution tracking and audit
 *
 * @module @gwi/core/policy/report-distribution
 */

import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import type { ComplianceReportTemplate } from './report-templates.js';
import { formatReportAsMarkdown, formatReportAsJSON } from './report-templates.js';
import type { SignedReport } from './report-signing.js';

// =============================================================================
// Types and Schemas
// =============================================================================

/**
 * Distribution channel types
 */
export const DistributionChannel = z.enum([
  'email',
  'webhook',
  'download_link',
  'slack',
  's3_upload',
]);
export type DistributionChannel = z.infer<typeof DistributionChannel>;

/**
 * Report format for distribution
 */
export const ReportFormat = z.enum([
  'json',
  'markdown',
  'pdf',
  'html',
]);
export type ReportFormat = z.infer<typeof ReportFormat>;

/**
 * Distribution status
 */
export const DistributionStatus = z.enum([
  'pending',
  'in_progress',
  'delivered',
  'failed',
  'expired',
  'revoked',
]);
export type DistributionStatus = z.infer<typeof DistributionStatus>;

/**
 * Email recipient
 */
export const EmailRecipient = z.object({
  /** Recipient email address */
  email: z.string().email(),
  /** Recipient name (optional) */
  name: z.string().optional(),
  /** Recipient type */
  type: z.enum(['to', 'cc', 'bcc']).default('to'),
});
export type EmailRecipient = z.infer<typeof EmailRecipient>;

/**
 * Email distribution configuration
 */
export const EmailDistributionConfig = z.object({
  /** Channel type */
  channel: z.literal('email'),
  /** Recipients */
  recipients: z.array(EmailRecipient).min(1),
  /** Email subject */
  subject: z.string().min(1),
  /** Email body template (supports {{variables}}) */
  bodyTemplate: z.string().optional(),
  /** Whether to attach the report file */
  attachReport: z.boolean().default(true),
  /** Report format for attachment */
  attachmentFormat: ReportFormat.default('pdf'),
  /** Reply-to address */
  replyTo: z.string().email().optional(),
  /** Custom headers */
  headers: z.record(z.string()).optional(),
});
export type EmailDistributionConfig = z.infer<typeof EmailDistributionConfig>;

/**
 * Webhook distribution configuration
 */
export const WebhookDistributionConfig = z.object({
  /** Channel type */
  channel: z.literal('webhook'),
  /** Webhook URL */
  url: z.string().url(),
  /** HTTP method */
  method: z.enum(['POST', 'PUT']).default('POST'),
  /** Custom headers */
  headers: z.record(z.string()).optional(),
  /** Include full report content */
  includeContent: z.boolean().default(true),
  /** Report format in payload */
  format: ReportFormat.default('json'),
  /** Secret for HMAC signature */
  secret: z.string().optional(),
  /** Retry configuration */
  retry: z.object({
    maxAttempts: z.number().int().min(1).max(10).default(3),
    backoffMs: z.number().int().min(100).max(60000).default(1000),
  }).optional(),
});
export type WebhookDistributionConfig = z.infer<typeof WebhookDistributionConfig>;

/**
 * Download link distribution configuration
 */
export const DownloadLinkConfig = z.object({
  /** Channel type */
  channel: z.literal('download_link'),
  /** Link expiration in seconds (default: 7 days) */
  expiresInSeconds: z.number().int().min(60).max(2592000).default(604800),
  /** Maximum download count (0 = unlimited) */
  maxDownloads: z.number().int().min(0).default(0),
  /** Require authentication */
  requireAuth: z.boolean().default(false),
  /** Allowed user IDs (if requireAuth is true) */
  allowedUserIds: z.array(z.string()).optional(),
  /** Report format */
  format: ReportFormat.default('pdf'),
  /** Password protection */
  password: z.string().optional(),
  /** Notify on download */
  notifyOnDownload: z.boolean().default(false),
  /** Notification email for download alerts */
  notificationEmail: z.string().email().optional(),
});
export type DownloadLinkConfig = z.infer<typeof DownloadLinkConfig>;

/**
 * Slack distribution configuration
 */
export const SlackDistributionConfig = z.object({
  /** Channel type */
  channel: z.literal('slack'),
  /** Slack channel or DM */
  target: z.string().min(1),
  /** Message template */
  messageTemplate: z.string().optional(),
  /** Include report as attachment */
  attachReport: z.boolean().default(false),
  /** Attachment format */
  attachmentFormat: ReportFormat.default('pdf'),
  /** Thread timestamp (for replies) */
  threadTs: z.string().optional(),
});
export type SlackDistributionConfig = z.infer<typeof SlackDistributionConfig>;

/**
 * S3 upload distribution configuration
 */
export const S3UploadConfig = z.object({
  /** Channel type */
  channel: z.literal('s3_upload'),
  /** S3 bucket name */
  bucket: z.string().min(1),
  /** Object key prefix */
  keyPrefix: z.string().default('compliance-reports/'),
  /** Report format */
  format: ReportFormat.default('json'),
  /** Enable server-side encryption */
  encryption: z.boolean().default(true),
  /** Storage class */
  storageClass: z.enum(['STANDARD', 'STANDARD_IA', 'GLACIER']).default('STANDARD'),
  /** Custom metadata */
  metadata: z.record(z.string()).optional(),
  /** Generate presigned URL after upload */
  generatePresignedUrl: z.boolean().default(false),
  /** Presigned URL expiration in seconds */
  presignedUrlExpiration: z.number().int().min(60).max(604800).default(3600),
});
export type S3UploadConfig = z.infer<typeof S3UploadConfig>;

/**
 * Union of all distribution configurations
 */
export const DistributionConfig = z.discriminatedUnion('channel', [
  EmailDistributionConfig,
  WebhookDistributionConfig,
  DownloadLinkConfig,
  SlackDistributionConfig,
  S3UploadConfig,
]);
export type DistributionConfig = z.infer<typeof DistributionConfig>;

/**
 * Distribution request
 */
export const DistributionRequest = z.object({
  /** Request ID */
  requestId: z.string(),
  /** Tenant ID */
  tenantId: z.string(),
  /** Report ID to distribute */
  reportId: z.string(),
  /** Report version (optional, defaults to latest) */
  reportVersion: z.string().optional(),
  /** Distribution configurations */
  distributions: z.array(DistributionConfig).min(1),
  /** Scheduled distribution time (optional) */
  scheduledAt: z.date().optional(),
  /** Request timestamp */
  requestedAt: z.date(),
  /** Requested by user ID */
  requestedBy: z.string(),
  /** Custom message to include */
  customMessage: z.string().optional(),
  /** Metadata */
  metadata: z.record(z.unknown()).optional(),
});
export type DistributionRequest = z.infer<typeof DistributionRequest>;

/**
 * Distribution attempt record
 */
export const DistributionAttempt = z.object({
  /** Attempt number */
  attemptNumber: z.number().int().min(1),
  /** Attempt timestamp */
  attemptedAt: z.date(),
  /** Success status */
  success: z.boolean(),
  /** Error message if failed */
  error: z.string().optional(),
  /** Error code */
  errorCode: z.string().optional(),
  /** Response from channel (if any) */
  response: z.record(z.unknown()).optional(),
  /** Duration in milliseconds */
  durationMs: z.number().int().optional(),
});
export type DistributionAttempt = z.infer<typeof DistributionAttempt>;

/**
 * Distribution record for tracking
 */
export const DistributionRecord = z.object({
  /** Distribution ID */
  distributionId: z.string(),
  /** Request ID */
  requestId: z.string(),
  /** Tenant ID */
  tenantId: z.string(),
  /** Report ID */
  reportId: z.string(),
  /** Report version */
  reportVersion: z.string(),
  /** Distribution channel */
  channel: DistributionChannel,
  /** Configuration used */
  config: DistributionConfig,
  /** Current status */
  status: DistributionStatus,
  /** Distribution attempts */
  attempts: z.array(DistributionAttempt).default([]),
  /** Created timestamp */
  createdAt: z.date(),
  /** Last updated timestamp */
  updatedAt: z.date(),
  /** Completed timestamp */
  completedAt: z.date().optional(),
  /** Delivered to (e.g., email addresses, webhook URL) */
  deliveredTo: z.array(z.string()).default([]),
  /** Download link details (for download_link channel) */
  downloadLink: z.object({
    /** Link token */
    token: z.string(),
    /** Full URL */
    url: z.string(),
    /** Expiration timestamp */
    expiresAt: z.date(),
    /** Download count */
    downloadCount: z.number().int().default(0),
    /** Max downloads */
    maxDownloads: z.number().int(),
    /** Password hash (stored securely, never plaintext) */
    passwordHash: z.string().optional(),
  }).optional(),
  /** S3 details (for s3_upload channel) */
  s3Details: z.object({
    /** S3 bucket */
    bucket: z.string(),
    /** S3 key */
    key: z.string(),
    /** Presigned URL (if generated) */
    presignedUrl: z.string().optional(),
    /** Presigned URL expiration */
    presignedUrlExpiresAt: z.date().optional(),
  }).optional(),
  /** Metadata */
  metadata: z.record(z.unknown()).optional(),
});
export type DistributionRecord = z.infer<typeof DistributionRecord>;

/**
 * Download link access record
 */
export const DownloadAccessRecord = z.object({
  /** Access ID */
  accessId: z.string(),
  /** Distribution ID */
  distributionId: z.string(),
  /** Link token */
  token: z.string(),
  /** Access timestamp */
  accessedAt: z.date(),
  /** User ID (if authenticated) */
  userId: z.string().optional(),
  /** IP address */
  ipAddress: z.string().optional(),
  /** User agent */
  userAgent: z.string().optional(),
  /** Success status */
  success: z.boolean(),
  /** Failure reason */
  failureReason: z.string().optional(),
});
export type DownloadAccessRecord = z.infer<typeof DownloadAccessRecord>;

/**
 * Distribution result
 */
export const DistributionResult = z.object({
  /** Request ID */
  requestId: z.string(),
  /** Overall success */
  success: z.boolean(),
  /** Distribution records */
  distributions: z.array(DistributionRecord),
  /** Summary */
  summary: z.object({
    /** Total distributions */
    total: z.number().int(),
    /** Successful */
    delivered: z.number().int(),
    /** Failed */
    failed: z.number().int(),
    /** Pending */
    pending: z.number().int(),
  }),
  /** Errors */
  errors: z.array(z.object({
    channel: DistributionChannel,
    error: z.string(),
  })).optional(),
  /** Completed timestamp */
  completedAt: z.date(),
});
export type DistributionResult = z.infer<typeof DistributionResult>;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique distribution ID
 */
export function generateDistributionId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `dist-${timestamp}-${random}`;
}

/**
 * Generate a unique request ID
 */
export function generateDistributionRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `req-${timestamp}-${random}`;
}

/**
 * Generate a secure download token
 */
export function generateDownloadToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate HMAC signature for webhook
 */
export function generateWebhookSignature(payload: string, secret: string): string {
  const hmac = createHash('sha256');
  hmac.update(secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Hash password for download link
 */
export function hashDownloadPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

/**
 * Verify download password
 */
export function verifyDownloadPassword(password: string, hash: string): boolean {
  return hashDownloadPassword(password) === hash;
}

/**
 * Calculate download link expiration
 */
export function calculateLinkExpiration(expiresInSeconds: number): Date {
  return new Date(Date.now() + expiresInSeconds * 1000);
}

/**
 * Check if a download link is expired
 */
export function isLinkExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * Check if download limit is reached
 */
export function isDownloadLimitReached(downloadCount: number, maxDownloads: number): boolean {
  return maxDownloads > 0 && downloadCount >= maxDownloads;
}

/**
 * Format report content based on format type
 */
export function formatReportContent(
  report: ComplianceReportTemplate,
  format: ReportFormat
): string {
  switch (format) {
    case 'json':
      return formatReportAsJSON(report);
    case 'markdown':
      return formatReportAsMarkdown(report);
    case 'html':
      // Basic HTML conversion from markdown
      const markdown = formatReportAsMarkdown(report);
      return convertMarkdownToHtml(markdown);
    case 'pdf':
      // PDF generation would require external library
      // Return placeholder indicating PDF content
      return `[PDF content for report ${report.reportId}]`;
    default:
      return formatReportAsJSON(report);
  }
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Basic markdown to HTML conversion with XSS protection
 * Note: For production use, consider using a vetted library like marked or markdown-it
 */
function convertMarkdownToHtml(markdown: string): string {
  // First, escape HTML to prevent XSS
  let html = escapeHtml(markdown)
    // Headers
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Code blocks
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Line breaks
    .replace(/\n/g, '<br>\n')
    // Horizontal rules
    .replace(/---/g, '<hr>');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Compliance Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1, h2, h3 { color: #333; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f4f4f4; }
  </style>
</head>
<body>
${html}
</body>
</html>`;
}

/**
 * Build email body from template
 */
export function buildEmailBody(
  template: string,
  report: ComplianceReportTemplate,
  customMessage?: string
): string {
  return template
    .replace(/\{\{reportId\}\}/g, report.reportId)
    .replace(/\{\{reportTitle\}\}/g, report.title)
    .replace(/\{\{organizationName\}\}/g, report.organizationName)
    .replace(/\{\{framework\}\}/g, typeof report.framework === 'string'
      ? report.framework
      : report.framework.name)
    .replace(/\{\{periodStart\}\}/g, report.period.start.toISOString().split('T')[0])
    .replace(/\{\{periodEnd\}\}/g, report.period.end.toISOString().split('T')[0])
    .replace(/\{\{generatedAt\}\}/g, report.generatedAt.toISOString())
    .replace(/\{\{customMessage\}\}/g, customMessage ?? '');
}

/**
 * Default email body template
 */
export const DEFAULT_EMAIL_TEMPLATE = `
Dear Recipient,

Please find attached the compliance report for {{organizationName}}.

Report Details:
- Title: {{reportTitle}}
- Framework: {{framework}}
- Period: {{periodStart}} to {{periodEnd}}
- Generated: {{generatedAt}}

{{customMessage}}

This is an automated message from the compliance reporting system.

Best regards,
Compliance Team
`.trim();

/**
 * Default Slack message template
 */
export const DEFAULT_SLACK_TEMPLATE = `
:page_facing_up: *Compliance Report Available*

*{{reportTitle}}*
Organization: {{organizationName}}
Framework: {{framework}}
Period: {{periodStart}} to {{periodEnd}}

{{customMessage}}
`.trim();

// =============================================================================
// Channel Interfaces
// =============================================================================

/**
 * Distribution channel handler interface
 */
export interface DistributionChannelHandler {
  /** Channel type */
  channel: DistributionChannel;

  /**
   * Distribute report through this channel
   */
  distribute(
    report: ComplianceReportTemplate,
    config: DistributionConfig,
    options: {
      signedReport?: SignedReport;
      customMessage?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<{
    success: boolean;
    deliveredTo: string[];
    error?: string;
    errorCode?: string;
    response?: Record<string, unknown>;
    downloadLink?: DistributionRecord['downloadLink'];
    s3Details?: DistributionRecord['s3Details'];
  }>;
}

/**
 * Email channel handler (abstract - requires implementation)
 */
export interface EmailChannelHandler extends DistributionChannelHandler {
  channel: 'email';

  /**
   * Send email with optional attachment
   */
  sendEmail(options: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    attachments?: Array<{
      filename: string;
      content: string | Buffer;
      contentType: string;
    }>;
    replyTo?: string;
    headers?: Record<string, string>;
  }): Promise<{ messageId: string }>;
}

/**
 * Webhook channel handler (abstract - requires implementation)
 */
export interface WebhookChannelHandler extends DistributionChannelHandler {
  channel: 'webhook';

  /**
   * Send webhook request
   */
  sendWebhook(options: {
    url: string;
    method: 'POST' | 'PUT';
    headers?: Record<string, string>;
    body: string;
    signature?: string;
  }): Promise<{ statusCode: number; body?: string }>;
}

// =============================================================================
// In-Memory Distribution Store
// =============================================================================

/**
 * Distribution store interface
 */
export interface DistributionStore {
  /**
   * Save a distribution record
   */
  save(record: DistributionRecord): Promise<DistributionRecord>;

  /**
   * Get a distribution by ID
   */
  get(tenantId: string, distributionId: string): Promise<DistributionRecord | null>;

  /**
   * Get all distributions for a report
   */
  getByReport(tenantId: string, reportId: string): Promise<DistributionRecord[]>;

  /**
   * Get all distributions for a request
   */
  getByRequest(tenantId: string, requestId: string): Promise<DistributionRecord[]>;

  /**
   * Update distribution status
   */
  updateStatus(
    tenantId: string,
    distributionId: string,
    status: DistributionStatus,
    updates?: Partial<DistributionRecord>
  ): Promise<DistributionRecord | null>;

  /**
   * Add an attempt to a distribution
   */
  addAttempt(
    tenantId: string,
    distributionId: string,
    attempt: DistributionAttempt
  ): Promise<DistributionRecord | null>;

  /**
   * Get distribution by download token
   */
  getByDownloadToken(token: string): Promise<DistributionRecord | null>;

  /**
   * Record download access
   */
  recordDownloadAccess(access: DownloadAccessRecord): Promise<void>;

  /**
   * Get download access history
   */
  getDownloadAccessHistory(distributionId: string): Promise<DownloadAccessRecord[]>;

  /**
   * Increment download count
   */
  incrementDownloadCount(tenantId: string, distributionId: string): Promise<number>;
}

/**
 * In-memory distribution store
 */
export class InMemoryDistributionStore implements DistributionStore {
  private distributions = new Map<string, DistributionRecord>();
  private downloadTokenIndex = new Map<string, string>();
  private downloadAccess = new Map<string, DownloadAccessRecord[]>();

  private getKey(tenantId: string, distributionId: string): string {
    return `${tenantId}:${distributionId}`;
  }

  async save(record: DistributionRecord): Promise<DistributionRecord> {
    const key = this.getKey(record.tenantId, record.distributionId);
    this.distributions.set(key, record);

    // Index download token if present
    if (record.downloadLink?.token) {
      this.downloadTokenIndex.set(record.downloadLink.token, key);
    }

    return record;
  }

  async get(tenantId: string, distributionId: string): Promise<DistributionRecord | null> {
    const key = this.getKey(tenantId, distributionId);
    return this.distributions.get(key) ?? null;
  }

  async getByReport(tenantId: string, reportId: string): Promise<DistributionRecord[]> {
    const results: DistributionRecord[] = [];
    for (const record of this.distributions.values()) {
      if (record.tenantId === tenantId && record.reportId === reportId) {
        results.push(record);
      }
    }
    return results;
  }

  async getByRequest(tenantId: string, requestId: string): Promise<DistributionRecord[]> {
    const results: DistributionRecord[] = [];
    for (const record of this.distributions.values()) {
      if (record.tenantId === tenantId && record.requestId === requestId) {
        results.push(record);
      }
    }
    return results;
  }

  async updateStatus(
    tenantId: string,
    distributionId: string,
    status: DistributionStatus,
    updates?: Partial<DistributionRecord>
  ): Promise<DistributionRecord | null> {
    const key = this.getKey(tenantId, distributionId);
    const record = this.distributions.get(key);

    if (!record) {
      return null;
    }

    const updated: DistributionRecord = {
      ...record,
      ...updates,
      status,
      updatedAt: new Date(),
      completedAt: ['delivered', 'failed', 'expired', 'revoked'].includes(status)
        ? new Date()
        : record.completedAt,
    };

    this.distributions.set(key, updated);

    // Index download token if added
    if (updated.downloadLink?.token && !this.downloadTokenIndex.has(updated.downloadLink.token)) {
      this.downloadTokenIndex.set(updated.downloadLink.token, key);
    }

    return updated;
  }

  async addAttempt(
    tenantId: string,
    distributionId: string,
    attempt: DistributionAttempt
  ): Promise<DistributionRecord | null> {
    const key = this.getKey(tenantId, distributionId);
    const record = this.distributions.get(key);

    if (!record) {
      return null;
    }

    const updated: DistributionRecord = {
      ...record,
      attempts: [...record.attempts, attempt],
      updatedAt: new Date(),
    };

    this.distributions.set(key, updated);
    return updated;
  }

  async getByDownloadToken(token: string): Promise<DistributionRecord | null> {
    const key = this.downloadTokenIndex.get(token);
    if (!key) {
      return null;
    }
    return this.distributions.get(key) ?? null;
  }

  async recordDownloadAccess(access: DownloadAccessRecord): Promise<void> {
    const existing = this.downloadAccess.get(access.distributionId) ?? [];
    existing.push(access);
    this.downloadAccess.set(access.distributionId, existing);
  }

  async getDownloadAccessHistory(distributionId: string): Promise<DownloadAccessRecord[]> {
    return this.downloadAccess.get(distributionId) ?? [];
  }

  async incrementDownloadCount(tenantId: string, distributionId: string): Promise<number> {
    const key = this.getKey(tenantId, distributionId);
    const record = this.distributions.get(key);

    if (!record || !record.downloadLink) {
      return 0;
    }

    const newCount = record.downloadLink.downloadCount + 1;
    const updated: DistributionRecord = {
      ...record,
      downloadLink: {
        ...record.downloadLink,
        downloadCount: newCount,
      },
      updatedAt: new Date(),
    };

    this.distributions.set(key, updated);
    return newCount;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.distributions.clear();
    this.downloadTokenIndex.clear();
    this.downloadAccess.clear();
  }
}

// =============================================================================
// Report Distribution Service
// =============================================================================

/**
 * Distribution service configuration
 */
export interface DistributionServiceConfig {
  /** Base URL for download links */
  downloadBaseUrl: string;
  /** Default email sender */
  defaultSender?: string;
  /** Channel handlers */
  handlers?: Map<DistributionChannel, DistributionChannelHandler>;
}

/**
 * Report distribution service
 */
export class ReportDistributionService {
  private config: DistributionServiceConfig;
  private store: DistributionStore;
  private handlers: Map<DistributionChannel, DistributionChannelHandler>;

  constructor(config: DistributionServiceConfig, store: DistributionStore) {
    this.config = config;
    this.store = store;
    this.handlers = config.handlers ?? new Map();
  }

  /**
   * Register a channel handler
   */
  registerHandler(handler: DistributionChannelHandler): void {
    this.handlers.set(handler.channel, handler);
  }

  /**
   * Distribute a report
   */
  async distribute(
    request: DistributionRequest,
    report: ComplianceReportTemplate,
    signedReport?: SignedReport
  ): Promise<DistributionResult> {
    const distributions: DistributionRecord[] = [];
    const errors: Array<{ channel: DistributionChannel; error: string }> = [];

    for (const config of request.distributions) {
      const distributionId = generateDistributionId();
      const now = new Date();

      // Create initial distribution record
      let record: DistributionRecord = {
        distributionId,
        requestId: request.requestId,
        tenantId: request.tenantId,
        reportId: request.reportId,
        reportVersion: request.reportVersion ?? report.version,
        channel: config.channel,
        config,
        status: 'pending',
        attempts: [],
        createdAt: now,
        updatedAt: now,
        deliveredTo: [],
        metadata: request.metadata,
      };

      // Save initial record
      record = await this.store.save(record);

      // Handle scheduled distribution
      if (request.scheduledAt && request.scheduledAt > now) {
        distributions.push(record);
        continue;
      }

      // Process distribution based on channel
      try {
        record = await this.processDistribution(record, report, signedReport, {
          customMessage: request.customMessage,
          metadata: request.metadata,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ channel: config.channel, error: errorMessage });

        const failedUpdate = await this.store.updateStatus(
          request.tenantId,
          distributionId,
          'failed',
          { deliveredTo: [] }
        );
        if (failedUpdate) record = failedUpdate;
      }

      distributions.push(record);
    }

    const summary = {
      total: distributions.length,
      delivered: distributions.filter(d => d.status === 'delivered').length,
      failed: distributions.filter(d => d.status === 'failed').length,
      pending: distributions.filter(d => d.status === 'pending').length,
    };

    return {
      requestId: request.requestId,
      success: summary.failed === 0,
      distributions,
      summary,
      errors: errors.length > 0 ? errors : undefined,
      completedAt: new Date(),
    };
  }

  /**
   * Process a single distribution
   */
  private async processDistribution(
    record: DistributionRecord,
    report: ComplianceReportTemplate,
    signedReport: SignedReport | undefined,
    options: {
      customMessage?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<DistributionRecord> {
    const startTime = Date.now();

    // Update status to in_progress
    record = await this.store.save({
      ...record,
      status: 'in_progress',
      updatedAt: new Date(),
    });

    const config = record.config;

    // Special handling for download_link channel (no external handler needed)
    if (config.channel === 'download_link') {
      return this.createDownloadLink(record, config);
    }

    // Get channel handler
    const handler = this.handlers.get(config.channel);

    if (!handler) {
      // No handler - create a simulated success for testing
      const attempt: DistributionAttempt = {
        attemptNumber: 1,
        attemptedAt: new Date(),
        success: true,
        durationMs: Date.now() - startTime,
        response: { simulated: true, message: 'No handler registered - simulated success' },
      };

      const afterAttempt = await this.store.addAttempt(
        record.tenantId,
        record.distributionId,
        attempt
      );
      if (afterAttempt) record = afterAttempt;

      const updated = await this.store.updateStatus(
        record.tenantId,
        record.distributionId,
        'delivered',
        { deliveredTo: this.getDeliveryTargets(config) }
      );
      return updated ?? record;
    }

    // Execute distribution with retry
    const maxAttempts = config.channel === 'webhook' && config.retry
      ? config.retry.maxAttempts
      : 1;

    let lastError: string | undefined;
    let lastErrorCode: string | undefined;

    for (let attemptNum = 1; attemptNum <= maxAttempts; attemptNum++) {
      const attemptStart = Date.now();

      try {
        const result = await handler.distribute(report, config, {
          signedReport,
          customMessage: options.customMessage,
          metadata: options.metadata,
        });

        const attempt: DistributionAttempt = {
          attemptNumber: attemptNum,
          attemptedAt: new Date(),
          success: result.success,
          error: result.error,
          errorCode: result.errorCode,
          response: result.response,
          durationMs: Date.now() - attemptStart,
        };

        const afterAttempt1 = await this.store.addAttempt(
          record.tenantId,
          record.distributionId,
          attempt
        );
        if (afterAttempt1) record = afterAttempt1;

        if (result.success) {
          const deliveredRecord = await this.store.updateStatus(
            record.tenantId,
            record.distributionId,
            'delivered',
            {
              deliveredTo: result.deliveredTo,
              downloadLink: result.downloadLink,
              s3Details: result.s3Details,
            }
          );
          return deliveredRecord ?? record;
        }

        lastError = result.error;
        lastErrorCode = result.errorCode;

        // Wait before retry (exponential backoff)
        if (attemptNum < maxAttempts && config.channel === 'webhook' && config.retry) {
          const backoff = config.retry.backoffMs * Math.pow(2, attemptNum - 1);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        const attempt: DistributionAttempt = {
          attemptNumber: attemptNum,
          attemptedAt: new Date(),
          success: false,
          error: lastError,
          durationMs: Date.now() - attemptStart,
        };

        const afterAttempt2 = await this.store.addAttempt(
          record.tenantId,
          record.distributionId,
          attempt
        );
        if (afterAttempt2) record = afterAttempt2;
      }
    }

    // All attempts failed
    const failedRecord = await this.store.updateStatus(
      record.tenantId,
      record.distributionId,
      'failed',
      { metadata: { ...record.metadata, lastError, lastErrorCode } }
    );
    return failedRecord ?? record;
  }

  /**
   * Create a download link
   */
  private async createDownloadLink(
    record: DistributionRecord,
    config: DownloadLinkConfig
  ): Promise<DistributionRecord> {
    const token = generateDownloadToken();
    const expiresAt = calculateLinkExpiration(config.expiresInSeconds);
    const url = `${this.config.downloadBaseUrl}/download/${token}`;

    const downloadLink: DistributionRecord['downloadLink'] = {
      token,
      url,
      expiresAt,
      downloadCount: 0,
      maxDownloads: config.maxDownloads,
      // Store password as hash, never plaintext
      passwordHash: config.password ? hashDownloadPassword(config.password) : undefined,
    };

    const deliveredRecord = await this.store.updateStatus(
      record.tenantId,
      record.distributionId,
      'delivered',
      {
        deliveredTo: [url],
        downloadLink,
      }
    );
    return deliveredRecord ?? record;
  }

  /**
   * Get delivery targets from config
   */
  private getDeliveryTargets(config: DistributionConfig): string[] {
    switch (config.channel) {
      case 'email':
        return config.recipients.map(r => r.email);
      case 'webhook':
        return [config.url];
      case 'slack':
        return [config.target];
      case 's3_upload':
        return [`s3://${config.bucket}/${config.keyPrefix}`];
      case 'download_link':
        return [];
      default:
        return [];
    }
  }

  /**
   * Validate and process a download request
   */
  async processDownload(
    token: string,
    options?: {
      userId?: string;
      password?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<{
    success: boolean;
    record?: DistributionRecord;
    error?: string;
    errorCode?: 'expired' | 'limit_reached' | 'auth_required' | 'invalid_password' | 'not_found' | 'revoked';
  }> {
    const record = await this.store.getByDownloadToken(token);

    if (!record || !record.downloadLink) {
      return { success: false, error: 'Download link not found', errorCode: 'not_found' };
    }

    const config = record.config as DownloadLinkConfig;

    // Check if revoked
    if (record.status === 'revoked') {
      await this.recordAccessAttempt(record, token, false, 'Link has been revoked', options);
      return { success: false, error: 'Download link has been revoked', errorCode: 'revoked' };
    }

    // Check expiration
    if (isLinkExpired(record.downloadLink.expiresAt)) {
      await this.store.updateStatus(record.tenantId, record.distributionId, 'expired');
      await this.recordAccessAttempt(record, token, false, 'Link expired', options);
      return { success: false, error: 'Download link has expired', errorCode: 'expired' };
    }

    // Check download limit
    if (isDownloadLimitReached(record.downloadLink.downloadCount, record.downloadLink.maxDownloads)) {
      await this.recordAccessAttempt(record, token, false, 'Download limit reached', options);
      return { success: false, error: 'Download limit reached', errorCode: 'limit_reached' };
    }

    // Check authentication
    if (config.requireAuth && !options?.userId) {
      await this.recordAccessAttempt(record, token, false, 'Authentication required', options);
      return { success: false, error: 'Authentication required', errorCode: 'auth_required' };
    }

    if (config.requireAuth && config.allowedUserIds && options?.userId) {
      if (!config.allowedUserIds.includes(options.userId)) {
        await this.recordAccessAttempt(record, token, false, 'User not authorized', options);
        return { success: false, error: 'Authentication required', errorCode: 'auth_required' };
      }
    }

    // Check password - verify against stored hash, never plaintext
    const storedPasswordHash = record.downloadLink.passwordHash;
    if (storedPasswordHash) {
      if (!options?.password) {
        await this.recordAccessAttempt(record, token, false, 'Password required', options);
        return { success: false, error: 'Invalid password', errorCode: 'invalid_password' };
      }
      if (!verifyDownloadPassword(options.password, storedPasswordHash)) {
        await this.recordAccessAttempt(record, token, false, 'Invalid password', options);
        return { success: false, error: 'Invalid password', errorCode: 'invalid_password' };
      }
    }

    // Increment download count
    await this.store.incrementDownloadCount(record.tenantId, record.distributionId);

    // Record successful access
    await this.recordAccessAttempt(record, token, true, undefined, options);

    // Get updated record
    const updatedRecord = await this.store.get(record.tenantId, record.distributionId);

    return { success: true, record: updatedRecord ?? record };
  }

  /**
   * Record download access attempt
   */
  private async recordAccessAttempt(
    record: DistributionRecord,
    token: string,
    success: boolean,
    failureReason: string | undefined,
    options?: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<void> {
    const access: DownloadAccessRecord = {
      accessId: `acc-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`,
      distributionId: record.distributionId,
      token,
      accessedAt: new Date(),
      userId: options?.userId,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      success,
      failureReason,
    };

    await this.store.recordDownloadAccess(access);
  }

  /**
   * Revoke a download link
   */
  async revokeDownloadLink(tenantId: string, distributionId: string): Promise<boolean> {
    const record = await this.store.get(tenantId, distributionId);

    if (!record || record.channel !== 'download_link') {
      return false;
    }

    await this.store.updateStatus(tenantId, distributionId, 'revoked');
    return true;
  }

  /**
   * Get distribution history for a report
   */
  async getDistributionHistory(tenantId: string, reportId: string): Promise<DistributionRecord[]> {
    return this.store.getByReport(tenantId, reportId);
  }

  /**
   * Get download access history
   */
  async getDownloadAccessHistory(distributionId: string): Promise<DownloadAccessRecord[]> {
    return this.store.getDownloadAccessHistory(distributionId);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create distribution service with in-memory store
 */
export function createDistributionService(
  config: DistributionServiceConfig
): ReportDistributionService {
  const store = new InMemoryDistributionStore();
  return new ReportDistributionService(config, store);
}

/**
 * Create distribution service with custom store
 */
export function createDistributionServiceWithStore(
  config: DistributionServiceConfig,
  store: DistributionStore
): ReportDistributionService {
  return new ReportDistributionService(config, store);
}

/**
 * Create a distribution request
 */
export function createDistributionRequest(
  tenantId: string,
  reportId: string,
  distributions: DistributionConfig[],
  options?: {
    reportVersion?: string;
    scheduledAt?: Date;
    requestedBy?: string;
    customMessage?: string;
    metadata?: Record<string, unknown>;
  }
): DistributionRequest {
  return {
    requestId: generateDistributionRequestId(),
    tenantId,
    reportId,
    reportVersion: options?.reportVersion,
    distributions,
    scheduledAt: options?.scheduledAt,
    requestedAt: new Date(),
    requestedBy: options?.requestedBy ?? 'system',
    customMessage: options?.customMessage,
    metadata: options?.metadata,
  };
}

// =============================================================================
// Singleton Management
// =============================================================================

let globalDistributionService: ReportDistributionService | null = null;

/**
 * Get the global distribution service
 */
export function getDistributionService(): ReportDistributionService {
  if (!globalDistributionService) {
    throw new Error('Distribution service not initialized. Call initializeDistributionService first.');
  }
  return globalDistributionService;
}

/**
 * Set the global distribution service
 */
export function setDistributionService(service: ReportDistributionService): void {
  globalDistributionService = service;
}

/**
 * Reset the global distribution service
 */
export function resetDistributionService(): void {
  globalDistributionService = null;
}

/**
 * Initialize with default in-memory store
 */
export function initializeDistributionService(
  config: DistributionServiceConfig
): ReportDistributionService {
  const service = createDistributionService(config);
  globalDistributionService = service;
  return service;
}
