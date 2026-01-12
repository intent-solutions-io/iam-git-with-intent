/**
 * Audit Log Export Service (D3.5)
 *
 * Export audit logs in multiple formats for compliance and analysis:
 * - JSON: Full fidelity, machine-readable
 * - CSV: Spreadsheet-compatible, human-readable
 * - SIEM (CEF): Common Event Format for security tools
 * - SIEM (Syslog): RFC 5424 syslog format
 *
 * Features:
 * - Date range and filter support
 * - Signed exports for attestation
 * - Streaming for large exports
 *
 * @module @gwi/core/policy
 */

import { createHash, createSign, createVerify } from 'crypto';
import type { ImmutableAuditLogEntry } from './audit-log-schema.js';
import type { ImmutableAuditLogStore, AuditLogQueryOptions } from './audit-log-storage.js';

// =============================================================================
// Export Format Types
// =============================================================================

/**
 * Supported export formats
 */
export type ExportFormat = 'json' | 'json-lines' | 'csv' | 'cef' | 'syslog';

/**
 * Export options
 */
export interface ExportOptions {
  /** Export format */
  format: ExportFormat;
  /** Tenant ID */
  tenantId: string;
  /** Start time filter */
  startTime?: Date;
  /** End time filter */
  endTime?: Date;
  /** Start sequence filter */
  startSequence?: number;
  /** End sequence filter */
  endSequence?: number;
  /** Actor ID filter */
  actorId?: string;
  /** Action category filter */
  actionCategory?: string;
  /** Resource type filter */
  resourceType?: string;
  /** High risk only */
  highRiskOnly?: boolean;
  /** Maximum entries to export */
  limit?: number;
  /** Include chain verification data */
  includeChainData?: boolean;
  /** Sign the export for attestation */
  sign?: boolean;
  /** Private key for signing (PEM format) */
  privateKey?: string;
  /** Key ID for signature identification */
  keyId?: string;
  /** Include metadata header */
  includeMetadata?: boolean;
  /** Pretty print (JSON only) */
  prettyPrint?: boolean;
  /** CSV delimiter */
  csvDelimiter?: string;
  /** SIEM device vendor (CEF) */
  deviceVendor?: string;
  /** SIEM device product (CEF) */
  deviceProduct?: string;
  /** SIEM device version (CEF) */
  deviceVersion?: string;
}

/**
 * Export metadata
 */
export interface ExportMetadata {
  /** Export timestamp */
  exportedAt: Date;
  /** Format used */
  format: ExportFormat;
  /** Tenant ID */
  tenantId: string;
  /** Query filters applied */
  filters: {
    startTime?: string;
    endTime?: string;
    startSequence?: number;
    endSequence?: number;
    actorId?: string;
    actionCategory?: string;
    resourceType?: string;
    highRiskOnly?: boolean;
  };
  /** Total entries exported */
  entryCount: number;
  /** Sequence range */
  sequenceRange: {
    start: number;
    end: number;
  };
  /** Time range */
  timeRange: {
    start: string;
    end: string;
  } | null;
  /** Export version */
  exportVersion: string;
  /** Schema version */
  schemaVersion: string;
}

/**
 * Export signature for attestation
 */
export interface ExportSignature {
  /** Signature algorithm */
  algorithm: 'RSA-SHA256' | 'RSA-SHA384' | 'RSA-SHA512';
  /** Key ID used for signing */
  keyId: string;
  /** Signature timestamp */
  signedAt: Date;
  /** Content hash that was signed */
  contentHash: string;
  /** Base64-encoded signature */
  signature: string;
}

/**
 * Complete export result
 */
export interface ExportResult {
  /** Export content */
  content: string;
  /** Export metadata */
  metadata: ExportMetadata;
  /** Optional signature */
  signature?: ExportSignature;
  /** Content type for HTTP responses */
  contentType: string;
  /** Suggested filename */
  filename: string;
}

// =============================================================================
// Export Formatters
// =============================================================================

/**
 * Format entry as JSON
 */
function formatEntryAsJson(entry: ImmutableAuditLogEntry, includeChainData: boolean): object {
  if (includeChainData) {
    return entry;
  }

  // Exclude chain data for simpler exports
  const { chain, contextHash, ...rest } = entry;
  return rest;
}

/**
 * Format entries as JSON
 */
function formatAsJson(
  entries: ImmutableAuditLogEntry[],
  metadata: ExportMetadata,
  options: ExportOptions
): string {
  const includeChainData = options.includeChainData ?? false;
  const prettyPrint = options.prettyPrint ?? false;

  const data = {
    metadata: options.includeMetadata !== false ? metadata : undefined,
    entries: entries.map((e) => formatEntryAsJson(e, includeChainData)),
  };

  return prettyPrint ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

/**
 * Format entries as JSON Lines (newline-delimited JSON)
 */
function formatAsJsonLines(
  entries: ImmutableAuditLogEntry[],
  metadata: ExportMetadata,
  options: ExportOptions
): string {
  const includeChainData = options.includeChainData ?? false;
  const lines: string[] = [];

  // Optional metadata as first line
  if (options.includeMetadata !== false) {
    lines.push(JSON.stringify({ _type: 'metadata', ...metadata }));
  }

  // Each entry on its own line
  for (const entry of entries) {
    lines.push(JSON.stringify(formatEntryAsJson(entry, includeChainData)));
  }

  return lines.join('\n');
}

/**
 * Escape CSV field value
 */
function escapeCsvField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format entries as CSV
 */
function formatAsCsv(
  entries: ImmutableAuditLogEntry[],
  _metadata: ExportMetadata,
  options: ExportOptions
): string {
  const delimiter = options.csvDelimiter ?? ',';
  const lines: string[] = [];

  // Header row
  const headers = [
    'id',
    'timestamp',
    'actor_type',
    'actor_id',
    'actor_name',
    'action_type',
    'action_category',
    'action_description',
    'resource_type',
    'resource_id',
    'resource_name',
    'outcome_status',
    'outcome_message',
    'high_risk',
    'sequence',
  ];
  lines.push(headers.join(delimiter));

  // Data rows
  for (const entry of entries) {
    const row = [
      entry.id,
      entry.timestamp,
      entry.actor.type,
      entry.actor.id,
      entry.actor.displayName ?? '',
      entry.action.type,
      entry.action.category,
      entry.action.description ?? '',
      entry.resource?.type ?? '',
      entry.resource?.id ?? '',
      entry.resource?.name ?? '',
      entry.outcome.status,
      entry.outcome.errorMessage ?? '',
      entry.highRisk ? 'true' : 'false',
      String(entry.chain.sequence),
    ];
    lines.push(row.map((v) => escapeCsvField(v, delimiter)).join(delimiter));
  }

  return lines.join('\n');
}

/**
 * Get CEF severity from entry
 */
function getCefSeverity(entry: ImmutableAuditLogEntry): number {
  if (entry.highRisk) return 8;
  if (entry.outcome.status === 'failure') return 5;
  if (entry.outcome.status === 'partial') return 3;
  return 1;
}

/**
 * Escape CEF extension value
 */
function escapeCefValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/=/g, '\\=').replace(/\n/g, '\\n');
}

/**
 * Format entries as CEF (Common Event Format)
 *
 * CEF Format: CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
 */
function formatAsCef(
  entries: ImmutableAuditLogEntry[],
  _metadata: ExportMetadata,
  options: ExportOptions
): string {
  const vendor = options.deviceVendor ?? 'GWI';
  const product = options.deviceProduct ?? 'AuditLog';
  const version = options.deviceVersion ?? '1.0';
  const lines: string[] = [];

  for (const entry of entries) {
    const severity = getCefSeverity(entry);
    const signatureId = `${entry.action.category}.${entry.action.type}`;
    const name = entry.action.description ?? entry.action.type;

    // Build extension key-value pairs
    const extensions: string[] = [
      `rt=${new Date(entry.timestamp).getTime()}`,
      `src=${escapeCefValue(entry.actor.id)}`,
      `suser=${escapeCefValue(entry.actor.displayName ?? entry.actor.id)}`,
      `act=${escapeCefValue(entry.action.type)}`,
      `cat=${escapeCefValue(entry.action.category)}`,
      `outcome=${escapeCefValue(entry.outcome.status)}`,
      `cs1=${escapeCefValue(entry.id)}`,
      `cs1Label=EntryID`,
      `cn1=${entry.chain.sequence}`,
      `cn1Label=Sequence`,
    ];

    if (entry.resource) {
      extensions.push(`dvc=${escapeCefValue(entry.resource.type)}`);
      extensions.push(`dvchost=${escapeCefValue(entry.resource.id)}`);
    }

    if (entry.highRisk) {
      extensions.push('cs2=high_risk');
      extensions.push('cs2Label=RiskLevel');
    }

    const cefLine = `CEF:0|${vendor}|${product}|${version}|${signatureId}|${escapeCefValue(name)}|${severity}|${extensions.join(' ')}`;
    lines.push(cefLine);
  }

  return lines.join('\n');
}

/**
 * Get syslog severity from entry
 */
function getSyslogSeverity(entry: ImmutableAuditLogEntry): number {
  // Syslog severity: 0=Emergency, 1=Alert, 2=Critical, 3=Error, 4=Warning, 5=Notice, 6=Info, 7=Debug
  if (entry.highRisk) return 2; // Critical
  if (entry.outcome.status === 'failure') return 3; // Error
  if (entry.outcome.status === 'partial') return 4; // Warning
  return 6; // Info
}

/**
 * Format entries as RFC 5424 Syslog
 *
 * Format: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
 */
function formatAsSyslog(
  entries: ImmutableAuditLogEntry[],
  _metadata: ExportMetadata,
  options: ExportOptions
): string {
  const appName = options.deviceProduct ?? 'gwi-audit';
  const facility = 13; // Log audit (facility code)
  const lines: string[] = [];

  for (const entry of entries) {
    const severity = getSyslogSeverity(entry);
    const priority = facility * 8 + severity;
    const timestamp = new Date(entry.timestamp).toISOString();
    const hostname = '-';
    const procId = entry.chain.sequence.toString();
    const msgId = `${entry.action.category}.${entry.action.type}`;

    // Structured data
    const sdElements = [
      `[audit@gwi entryId="${entry.id}" actor="${entry.actor.id}" action="${entry.action.type}" outcome="${entry.outcome.status}"${entry.highRisk ? ' highRisk="true"' : ''}]`,
    ];

    // Message
    const msg = entry.action.description ?? `${entry.actor.id} performed ${entry.action.type}`;

    const syslogLine = `<${priority}>1 ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${sdElements.join('')} ${msg}`;
    lines.push(syslogLine);
  }

  return lines.join('\n');
}

// =============================================================================
// Export Signing
// =============================================================================

/**
 * Compute hash of export content
 */
function computeExportHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Sign export content
 */
function signExport(
  content: string,
  privateKey: string,
  keyId: string
): ExportSignature {
  const contentHash = computeExportHash(content);
  const sign = createSign('RSA-SHA256');
  sign.update(contentHash);
  sign.end();

  const signature = sign.sign(privateKey, 'base64');

  return {
    algorithm: 'RSA-SHA256',
    keyId,
    signedAt: new Date(),
    contentHash,
    signature,
  };
}

/**
 * Verify export signature
 */
export function verifyExportSignature(
  content: string,
  signature: ExportSignature,
  publicKey: string
): boolean {
  const contentHash = computeExportHash(content);

  // Check hash matches
  if (contentHash !== signature.contentHash) {
    return false;
  }

  // Verify signature
  const verify = createVerify('RSA-SHA256');
  verify.update(contentHash);
  verify.end();

  return verify.verify(publicKey, signature.signature, 'base64');
}

// =============================================================================
// Export Service
// =============================================================================

/**
 * Audit log export service interface
 */
export interface AuditLogExportService {
  /**
   * Export audit log entries
   */
  export(options: ExportOptions): Promise<ExportResult>;

  /**
   * Get supported formats
   */
  getSupportedFormats(): ExportFormat[];

  /**
   * Verify an export signature
   */
  verifySignature(content: string, signature: ExportSignature, publicKey: string): boolean;
}

/**
 * Export service implementation
 */
export class AuditLogExportServiceImpl implements AuditLogExportService {
  constructor(private readonly store: ImmutableAuditLogStore) {}

  async export(options: ExportOptions): Promise<ExportResult> {
    // Build query options
    const queryOptions: AuditLogQueryOptions = {
      tenantId: options.tenantId,
      startTime: options.startTime,
      endTime: options.endTime,
      startSequence: options.startSequence,
      endSequence: options.endSequence,
      actorId: options.actorId,
      actionCategory: options.actionCategory,
      resourceType: options.resourceType,
      highRiskOnly: options.highRiskOnly,
      limit: options.limit ?? 10000,
      sortOrder: 'asc',
    };

    // Query entries
    const result = await this.store.query(queryOptions);
    const entries = result.entries;

    // Build metadata
    const metadata = this.buildMetadata(entries, options);

    // Format content
    const content = this.formatContent(entries, metadata, options);

    // Optionally sign
    let signature: ExportSignature | undefined;
    if (options.sign && options.privateKey && options.keyId) {
      signature = signExport(content, options.privateKey, options.keyId);
    }

    // Determine content type and filename
    const { contentType, filename } = this.getContentInfo(options, metadata);

    return {
      content,
      metadata,
      signature,
      contentType,
      filename,
    };
  }

  getSupportedFormats(): ExportFormat[] {
    return ['json', 'json-lines', 'csv', 'cef', 'syslog'];
  }

  verifySignature(content: string, signature: ExportSignature, publicKey: string): boolean {
    return verifyExportSignature(content, signature, publicKey);
  }

  private buildMetadata(
    entries: ImmutableAuditLogEntry[],
    options: ExportOptions
  ): ExportMetadata {
    const sortedByTime = [...entries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      exportedAt: new Date(),
      format: options.format,
      tenantId: options.tenantId,
      filters: {
        startTime: options.startTime?.toISOString(),
        endTime: options.endTime?.toISOString(),
        startSequence: options.startSequence,
        endSequence: options.endSequence,
        actorId: options.actorId,
        actionCategory: options.actionCategory,
        resourceType: options.resourceType,
        highRiskOnly: options.highRiskOnly,
      },
      entryCount: entries.length,
      sequenceRange: {
        start: entries.length > 0 ? entries[0].chain.sequence : 0,
        end: entries.length > 0 ? entries[entries.length - 1].chain.sequence : -1,
      },
      timeRange:
        sortedByTime.length > 0
          ? {
              start: sortedByTime[0].timestamp,
              end: sortedByTime[sortedByTime.length - 1].timestamp,
            }
          : null,
      exportVersion: '1.0',
      schemaVersion: '1.0',
    };
  }

  private formatContent(
    entries: ImmutableAuditLogEntry[],
    metadata: ExportMetadata,
    options: ExportOptions
  ): string {
    switch (options.format) {
      case 'json':
        return formatAsJson(entries, metadata, options);
      case 'json-lines':
        return formatAsJsonLines(entries, metadata, options);
      case 'csv':
        return formatAsCsv(entries, metadata, options);
      case 'cef':
        return formatAsCef(entries, metadata, options);
      case 'syslog':
        return formatAsSyslog(entries, metadata, options);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  private getContentInfo(
    options: ExportOptions,
    metadata: ExportMetadata
  ): { contentType: string; filename: string } {
    const timestamp = metadata.exportedAt.toISOString().replace(/[:.]/g, '-');
    const base = `audit-export-${options.tenantId}-${timestamp}`;

    switch (options.format) {
      case 'json':
        return {
          contentType: 'application/json',
          filename: `${base}.json`,
        };
      case 'json-lines':
        return {
          contentType: 'application/x-ndjson',
          filename: `${base}.jsonl`,
        };
      case 'csv':
        return {
          contentType: 'text/csv',
          filename: `${base}.csv`,
        };
      case 'cef':
        return {
          contentType: 'text/plain',
          filename: `${base}.cef`,
        };
      case 'syslog':
        return {
          contentType: 'text/plain',
          filename: `${base}.log`,
        };
      default:
        return {
          contentType: 'application/octet-stream',
          filename: `${base}.txt`,
        };
    }
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an audit log export service
 */
export function createAuditLogExportService(
  store: ImmutableAuditLogStore
): AuditLogExportService {
  return new AuditLogExportServiceImpl(store);
}

// =============================================================================
// Singleton Management
// =============================================================================

let exportServiceInstance: AuditLogExportService | null = null;

/**
 * Initialize the export service singleton
 */
export function initializeAuditLogExportService(
  store: ImmutableAuditLogStore
): AuditLogExportService {
  exportServiceInstance = createAuditLogExportService(store);
  return exportServiceInstance;
}

/**
 * Get the export service singleton
 */
export function getAuditLogExportService(): AuditLogExportService {
  if (!exportServiceInstance) {
    throw new Error(
      'AuditLogExportService not initialized. Call initializeAuditLogExportService first.'
    );
  }
  return exportServiceInstance;
}

/**
 * Set a custom export service
 */
export function setAuditLogExportService(service: AuditLogExportService): void {
  exportServiceInstance = service;
}

/**
 * Reset the export service singleton
 */
export function resetAuditLogExportService(): void {
  exportServiceInstance = null;
}
