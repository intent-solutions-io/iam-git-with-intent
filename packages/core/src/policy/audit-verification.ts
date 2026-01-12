/**
 * Audit Log Integrity Verification (D3.4)
 *
 * Comprehensive verification service for audit log chain integrity.
 * Detects tampering, gaps, and chain breaks with detailed reporting.
 *
 * @module @gwi/core/policy
 */

import type { ImmutableAuditLogEntry } from './audit-log-schema.js';
import type { ImmutableAuditLogStore } from './audit-log-storage.js';
import {
  verifyChain,
  type EntryVerificationResult,
} from './crypto-chain.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Types of integrity issues that can be detected
 */
export type IntegrityIssueType =
  | 'content_hash_mismatch' // Entry content was modified
  | 'chain_link_broken' // prevHash doesn't match previous entry
  | 'sequence_gap' // Missing sequence numbers
  | 'sequence_duplicate' // Duplicate sequence numbers
  | 'first_entry_invalid' // First entry has non-null prevHash
  | 'timestamp_regression' // Entry timestamp is before previous entry
  | 'algorithm_mismatch'; // Inconsistent hash algorithms in chain

/**
 * Severity levels for integrity issues
 */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Individual integrity issue
 */
export interface IntegrityIssue {
  /** Type of issue detected */
  type: IntegrityIssueType;
  /** Severity level */
  severity: IssueSeverity;
  /** Sequence number where issue was found */
  sequence: number;
  /** Entry ID where issue was found */
  entryId: string;
  /** Human-readable description */
  message: string;
  /** Expected value (if applicable) */
  expected?: string;
  /** Actual value (if applicable) */
  actual?: string;
  /** Related entry IDs (for cross-reference issues) */
  relatedEntries?: string[];
}

/**
 * Summary statistics for chain health
 */
export interface ChainHealthStats {
  /** Total entries in the chain */
  totalEntries: number;
  /** Number of entries verified */
  entriesVerified: number;
  /** Sequence range covered */
  sequenceRange: {
    start: number;
    end: number;
  };
  /** Time range covered */
  timeRange: {
    start: Date;
    end: Date;
  } | null;
  /** Number of gaps detected */
  gapsDetected: number;
  /** Total missing entries (sum of all gaps) */
  missingEntries: number;
  /** Hash algorithms used in chain */
  algorithmsUsed: string[];
  /** Chain continuity percentage (0-100) */
  continuityPercent: number;
}

/**
 * Detailed verification report
 */
export interface VerificationReport {
  /** Tenant ID verified */
  tenantId: string;
  /** Overall verification result */
  valid: boolean;
  /** Timestamp of verification */
  verifiedAt: Date;
  /** Duration of verification in milliseconds */
  durationMs: number;
  /** Chain health statistics */
  stats: ChainHealthStats;
  /** List of issues found (empty if valid) */
  issues: IntegrityIssue[];
  /** Summary message */
  summary: string;
  /** Detailed entry-level results (optional, for verbose mode) */
  entryDetails?: EntryVerificationResult[];
}

/**
 * Verification options
 */
export interface VerificationOptions {
  /** Start sequence for partial verification */
  startSequence?: number;
  /** End sequence for partial verification */
  endSequence?: number;
  /** Include detailed entry-level results */
  includeEntryDetails?: boolean;
  /** Stop on first error */
  stopOnFirstError?: boolean;
  /** Verify timestamps are monotonically increasing */
  verifyTimestamps?: boolean;
  /** Maximum entries to verify (for large chains) */
  maxEntries?: number;
}

// =============================================================================
// Issue Helpers
// =============================================================================

/**
 * Get severity for an issue type
 */
function getIssueSeverity(type: IntegrityIssueType): IssueSeverity {
  switch (type) {
    case 'content_hash_mismatch':
      return 'critical';
    case 'chain_link_broken':
      return 'critical';
    case 'sequence_gap':
      return 'high';
    case 'sequence_duplicate':
      return 'high';
    case 'first_entry_invalid':
      return 'high';
    case 'timestamp_regression':
      return 'medium';
    case 'algorithm_mismatch':
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Create an integrity issue
 */
function createIssue(
  type: IntegrityIssueType,
  sequence: number,
  entryId: string,
  message: string,
  extra?: { expected?: string; actual?: string; relatedEntries?: string[] }
): IntegrityIssue {
  return {
    type,
    severity: getIssueSeverity(type),
    sequence,
    entryId,
    message,
    ...extra,
  };
}

// =============================================================================
// Verification Service
// =============================================================================

/**
 * Audit verification service interface
 */
export interface AuditVerificationService {
  /**
   * Verify chain integrity for a tenant
   */
  verify(tenantId: string, options?: VerificationOptions): Promise<VerificationReport>;

  /**
   * Quick check if chain is valid (no detailed report)
   */
  isChainValid(tenantId: string): Promise<boolean>;

  /**
   * Get chain health statistics without full verification
   */
  getChainHealth(tenantId: string): Promise<ChainHealthStats | null>;
}

/**
 * Implementation of audit verification service
 */
export class AuditVerificationServiceImpl implements AuditVerificationService {
  constructor(private readonly store: ImmutableAuditLogStore) {}

  async verify(
    tenantId: string,
    options: VerificationOptions = {}
  ): Promise<VerificationReport> {
    const startTime = Date.now();
    const issues: IntegrityIssue[] = [];

    // Get chain metadata
    const metadata = await this.store.getMetadata(tenantId);
    if (!metadata) {
      return this.createEmptyReport(tenantId, startTime);
    }

    // Determine sequence range
    const startSeq = options.startSequence ?? 0;
    const endSeq = options.endSequence ?? metadata.lastSequence;
    const maxEntries = options.maxEntries ?? Infinity;

    // Query entries in range
    const queryResult = await this.store.query({
      tenantId,
      startSequence: startSeq,
      endSequence: endSeq,
      limit: Math.min(maxEntries, 10000),
    });

    const entries = queryResult.entries;

    if (entries.length === 0) {
      return this.createEmptyReport(tenantId, startTime);
    }

    // Sort by sequence to ensure order
    entries.sort((a, b) => a.chain.sequence - b.chain.sequence);

    // Run cryptographic verification
    // For partial verification, we skip chain link check on first entry
    // since we don't know the expected prevHash
    const isPartialVerification = startSeq > 0;
    const chainResult = verifyChain(entries, {
      startSequence: startSeq,
      expectedFirstPrevHash: startSeq === 0 ? null : undefined,
    });

    // Collect issues from chain verification
    for (const detail of chainResult.details) {
      if (!detail.contentHashValid) {
        issues.push(
          createIssue(
            'content_hash_mismatch',
            detail.sequence,
            detail.entryId,
            `Content hash mismatch at sequence ${detail.sequence}`,
            {
              expected: detail.expectedContentHash,
              actual: detail.actualContentHash,
            }
          )
        );
        if (options.stopOnFirstError) break;
      }
      if (!detail.chainLinkValid) {
        // For partial verification, skip chain link issue on first entry
        // since we don't have the previous entry to compare against
        const isFirstEntryInPartialVerification =
          isPartialVerification && detail.sequence === entries[0].chain.sequence;
        if (!isFirstEntryInPartialVerification) {
          issues.push(
            createIssue(
              'chain_link_broken',
              detail.sequence,
              detail.entryId,
              `Chain link broken at sequence ${detail.sequence}: prevHash does not match previous entry`
            )
          );
          if (options.stopOnFirstError) break;
        }
      }
    }

    // Detect sequence gaps
    const gaps = this.detectSequenceGaps(entries, startSeq);
    for (const gap of gaps) {
      issues.push(
        createIssue(
          'sequence_gap',
          gap.afterSequence,
          gap.afterEntryId,
          `Gap detected: missing sequences ${gap.missing.start}-${gap.missing.end} (${gap.missing.count} entries)`,
          {
            expected: `sequence ${gap.afterSequence + 1}`,
            actual: `sequence ${gap.nextSequence}`,
          }
        )
      );
    }

    // Detect duplicate sequences
    const duplicates = this.detectDuplicateSequences(entries);
    for (const dup of duplicates) {
      issues.push(
        createIssue(
          'sequence_duplicate',
          dup.sequence,
          dup.entryIds[0],
          `Duplicate sequence ${dup.sequence} found in ${dup.entryIds.length} entries`,
          {
            relatedEntries: dup.entryIds,
          }
        )
      );
    }

    // Verify first entry has null prevHash
    if (entries.length > 0 && startSeq === 0) {
      const firstEntry = entries[0];
      if (firstEntry.chain.prevHash !== null) {
        issues.push(
          createIssue(
            'first_entry_invalid',
            0,
            firstEntry.id,
            'First entry in chain should have null prevHash',
            {
              expected: 'null',
              actual: firstEntry.chain.prevHash,
            }
          )
        );
      }
    }

    // Optionally verify timestamps
    if (options.verifyTimestamps) {
      const timestampIssues = this.verifyTimestampOrder(entries);
      issues.push(...timestampIssues);
    }

    // Check for algorithm consistency
    const algorithmIssue = this.checkAlgorithmConsistency(entries);
    if (algorithmIssue) {
      issues.push(algorithmIssue);
    }

    // Sort issues by severity and sequence
    issues.sort((a, b) => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return a.sequence - b.sequence;
    });

    // Calculate stats
    const stats = this.calculateStats(entries, gaps);

    // Build report
    const durationMs = Date.now() - startTime;
    const valid = issues.length === 0;

    return {
      tenantId,
      valid,
      verifiedAt: new Date(),
      durationMs,
      stats,
      issues,
      summary: this.buildSummary(valid, issues, stats),
      entryDetails: options.includeEntryDetails ? chainResult.details : undefined,
    };
  }

  async isChainValid(tenantId: string): Promise<boolean> {
    const result = await this.store.verifyChainIntegrity(tenantId);
    return result.valid;
  }

  async getChainHealth(tenantId: string): Promise<ChainHealthStats | null> {
    const metadata = await this.store.getMetadata(tenantId);
    if (!metadata) return null;

    // Quick query to get sample entries for algorithm detection
    const sample = await this.store.query({ tenantId, limit: 100 });
    const algorithms = [...new Set(sample.entries.map((e) => e.chain.algorithm))];

    // Calculate continuity from metadata
    const expectedEntries = metadata.lastSequence + 1;
    const continuityPercent =
      expectedEntries > 0
        ? Math.round((metadata.entryCount / expectedEntries) * 100)
        : 100;

    return {
      totalEntries: metadata.entryCount,
      entriesVerified: 0, // Not verified, just stats
      sequenceRange: {
        start: 0, // Entries always start at sequence 0
        end: metadata.lastSequence,
      },
      timeRange:
        metadata.createdAt && metadata.lastUpdatedAt
          ? {
              start: metadata.createdAt,
              end: metadata.lastUpdatedAt,
            }
          : null,
      gapsDetected: expectedEntries - metadata.entryCount,
      missingEntries: Math.max(0, expectedEntries - metadata.entryCount),
      algorithmsUsed: algorithms,
      continuityPercent,
    };
  }

  private createEmptyReport(tenantId: string, startTime: number): VerificationReport {
    return {
      tenantId,
      valid: true,
      verifiedAt: new Date(),
      durationMs: Date.now() - startTime,
      stats: {
        totalEntries: 0,
        entriesVerified: 0,
        sequenceRange: { start: 0, end: -1 },
        timeRange: null,
        gapsDetected: 0,
        missingEntries: 0,
        algorithmsUsed: [],
        continuityPercent: 100,
      },
      issues: [],
      summary: 'No entries to verify',
    };
  }

  private detectSequenceGaps(
    entries: ImmutableAuditLogEntry[],
    expectedStart: number
  ): Array<{
    afterSequence: number;
    afterEntryId: string;
    nextSequence: number;
    missing: { start: number; end: number; count: number };
  }> {
    const gaps: Array<{
      afterSequence: number;
      afterEntryId: string;
      nextSequence: number;
      missing: { start: number; end: number; count: number };
    }> = [];

    if (entries.length === 0) return gaps;

    // Check if first entry starts at expected sequence
    if (entries[0].chain.sequence > expectedStart) {
      gaps.push({
        afterSequence: expectedStart - 1,
        afterEntryId: 'start',
        nextSequence: entries[0].chain.sequence,
        missing: {
          start: expectedStart,
          end: entries[0].chain.sequence - 1,
          count: entries[0].chain.sequence - expectedStart,
        },
      });
    }

    // Check for gaps between entries
    for (let i = 1; i < entries.length; i++) {
      const prevEntry = entries[i - 1];
      const currEntry = entries[i];
      const expectedSeq = prevEntry.chain.sequence + 1;

      if (currEntry.chain.sequence > expectedSeq) {
        gaps.push({
          afterSequence: prevEntry.chain.sequence,
          afterEntryId: prevEntry.id,
          nextSequence: currEntry.chain.sequence,
          missing: {
            start: expectedSeq,
            end: currEntry.chain.sequence - 1,
            count: currEntry.chain.sequence - expectedSeq,
          },
        });
      }
    }

    return gaps;
  }

  private detectDuplicateSequences(
    entries: ImmutableAuditLogEntry[]
  ): Array<{ sequence: number; entryIds: string[] }> {
    const sequenceMap = new Map<number, string[]>();

    for (const entry of entries) {
      const seq = entry.chain.sequence;
      const existing = sequenceMap.get(seq) ?? [];
      existing.push(entry.id);
      sequenceMap.set(seq, existing);
    }

    const duplicates: Array<{ sequence: number; entryIds: string[] }> = [];
    for (const [sequence, entryIds] of sequenceMap) {
      if (entryIds.length > 1) {
        duplicates.push({ sequence, entryIds });
      }
    }

    return duplicates;
  }

  private verifyTimestampOrder(entries: ImmutableAuditLogEntry[]): IntegrityIssue[] {
    const issues: IntegrityIssue[] = [];

    for (let i = 1; i < entries.length; i++) {
      const prevEntry = entries[i - 1];
      const currEntry = entries[i];
      const prevTime = new Date(prevEntry.timestamp);
      const currTime = new Date(currEntry.timestamp);

      if (currTime < prevTime) {
        issues.push(
          createIssue(
            'timestamp_regression',
            currEntry.chain.sequence,
            currEntry.id,
            `Timestamp regression: entry ${currEntry.chain.sequence} is earlier than entry ${prevEntry.chain.sequence}`,
            {
              expected: `>= ${prevEntry.timestamp}`,
              actual: currEntry.timestamp,
              relatedEntries: [prevEntry.id],
            }
          )
        );
      }
    }

    return issues;
  }

  private checkAlgorithmConsistency(
    entries: ImmutableAuditLogEntry[]
  ): IntegrityIssue | null {
    if (entries.length === 0) return null;

    const algorithms = new Set(entries.map((e) => e.chain.algorithm));
    if (algorithms.size > 1) {
      const algList = [...algorithms].join(', ');
      return createIssue(
        'algorithm_mismatch',
        entries[0].chain.sequence,
        entries[0].id,
        `Multiple hash algorithms used in chain: ${algList}`,
        {
          expected: 'single consistent algorithm',
          actual: algList,
        }
      );
    }

    return null;
  }

  private calculateStats(
    entries: ImmutableAuditLogEntry[],
    gaps: Array<{ missing: { count: number } }>
  ): ChainHealthStats {
    if (entries.length === 0) {
      return {
        totalEntries: 0,
        entriesVerified: 0,
        sequenceRange: { start: 0, end: -1 },
        timeRange: null,
        gapsDetected: 0,
        missingEntries: 0,
        algorithmsUsed: [],
        continuityPercent: 100,
      };
    }

    const totalMissing = gaps.reduce((sum, g) => sum + g.missing.count, 0);
    const expectedTotal = entries.length + totalMissing;
    const continuityPercent =
      expectedTotal > 0 ? Math.round((entries.length / expectedTotal) * 100) : 100;

    const sortedByTime = [...entries].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      totalEntries: entries.length,
      entriesVerified: entries.length,
      sequenceRange: {
        start: entries[0].chain.sequence,
        end: entries[entries.length - 1].chain.sequence,
      },
      timeRange: {
        start: new Date(sortedByTime[0].timestamp),
        end: new Date(sortedByTime[sortedByTime.length - 1].timestamp),
      },
      gapsDetected: gaps.length,
      missingEntries: totalMissing,
      algorithmsUsed: [...new Set(entries.map((e) => e.chain.algorithm))],
      continuityPercent,
    };
  }

  private buildSummary(
    valid: boolean,
    issues: IntegrityIssue[],
    stats: ChainHealthStats
  ): string {
    if (valid) {
      return `Chain integrity verified: ${stats.entriesVerified} entries, ${stats.continuityPercent}% continuity`;
    }

    const criticalCount = issues.filter((i) => i.severity === 'critical').length;
    const highCount = issues.filter((i) => i.severity === 'high').length;
    const otherCount = issues.length - criticalCount - highCount;

    const parts: string[] = [];
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (highCount > 0) parts.push(`${highCount} high`);
    if (otherCount > 0) parts.push(`${otherCount} other`);

    return `Chain integrity FAILED: ${parts.join(', ')} issue(s) found`;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create an audit verification service
 */
export function createAuditVerificationService(
  store: ImmutableAuditLogStore
): AuditVerificationService {
  return new AuditVerificationServiceImpl(store);
}

// =============================================================================
// Singleton Management
// =============================================================================

let defaultVerificationService: AuditVerificationService | null = null;

/**
 * Get the default audit verification service
 * Note: Requires the audit log store to be set first
 */
export function getAuditVerificationService(): AuditVerificationService | null {
  return defaultVerificationService;
}

/**
 * Set the default audit verification service
 */
export function setAuditVerificationService(
  service: AuditVerificationService
): void {
  defaultVerificationService = service;
}

/**
 * Reset the default audit verification service
 */
export function resetAuditVerificationService(): void {
  defaultVerificationService = null;
}

/**
 * Initialize verification service with a store
 */
export function initializeAuditVerificationService(
  store: ImmutableAuditLogStore
): AuditVerificationService {
  const service = createAuditVerificationService(store);
  setAuditVerificationService(service);
  return service;
}
