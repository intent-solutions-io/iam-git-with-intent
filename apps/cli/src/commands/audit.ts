/**
 * gwi audit command
 *
 * Audit log management and integrity verification commands.
 * Epic D: Policy & Audit - D3.4: Integrity Verification
 */

import chalk from 'chalk';
import {
  createAuditVerificationService,
  createInMemoryAuditLogStore,
  type VerificationReport,
  type IntegrityIssue,
  type IssueSeverity,
} from '@gwi/core';

export interface AuditVerifyOptions {
  tenant?: string;
  startSequence?: number;
  endSequence?: number;
  maxEntries?: number;
  verifyTimestamps?: boolean;
  includeDetails?: boolean;
  stopOnFirstError?: boolean;
  json?: boolean;
  verbose?: boolean;
}

/**
 * Get severity color for display
 */
function getSeverityColor(severity: IssueSeverity): (text: string) => string {
  switch (severity) {
    case 'critical':
      return chalk.red.bold;
    case 'high':
      return chalk.red;
    case 'medium':
      return chalk.yellow;
    case 'low':
      return chalk.dim;
    default:
      return chalk.white;
  }
}

/**
 * Get severity icon for display
 */
function getSeverityIcon(severity: IssueSeverity): string {
  switch (severity) {
    case 'critical':
      return chalk.red.bold('!!');
    case 'high':
      return chalk.red('!');
    case 'medium':
      return chalk.yellow('~');
    case 'low':
      return chalk.dim('-');
    default:
      return ' ';
  }
}

/**
 * Format an integrity issue for display
 */
function formatIssue(issue: IntegrityIssue, verbose: boolean): string {
  const lines: string[] = [];
  const severityColor = getSeverityColor(issue.severity);
  const icon = getSeverityIcon(issue.severity);

  lines.push(
    `    ${icon} ${severityColor(`[${issue.severity.toUpperCase()}]`)} ${issue.message}`
  );

  if (verbose) {
    lines.push(`       Type: ${issue.type}`);
    lines.push(`       Sequence: ${issue.sequence}`);
    lines.push(`       Entry ID: ${issue.entryId}`);
    if (issue.expected) {
      lines.push(`       Expected: ${issue.expected}`);
    }
    if (issue.actual) {
      lines.push(`       Actual: ${issue.actual}`);
    }
    if (issue.relatedEntries?.length) {
      lines.push(`       Related: ${issue.relatedEntries.join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format verification report for display
 */
function formatReport(report: VerificationReport, verbose: boolean): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(chalk.bold('  Audit Log Verification Report'));
  lines.push(chalk.dim('  ─────────────────────────────────────────────────────'));
  lines.push('');

  // Tenant info
  lines.push(chalk.bold('  Tenant:'));
  lines.push(`    ID: ${report.tenantId}`);
  lines.push(`    Verified at: ${report.verifiedAt.toISOString()}`);
  lines.push(`    Duration: ${report.durationMs}ms`);
  lines.push('');

  // Result
  const resultIcon = report.valid ? chalk.green('✓') : chalk.red('✗');
  const resultText = report.valid
    ? chalk.green('CHAIN INTEGRITY VERIFIED')
    : chalk.red('INTEGRITY ISSUES DETECTED');
  lines.push(chalk.bold('  Result:'));
  lines.push(`    ${resultIcon} ${resultText}`);
  lines.push('');

  // Summary
  lines.push(chalk.bold('  Summary:'));
  lines.push(`    ${report.summary}`);
  lines.push('');

  // Statistics
  lines.push(chalk.bold('  Statistics:'));
  lines.push(`    Total entries: ${report.stats.totalEntries}`);
  lines.push(`    Entries verified: ${report.stats.entriesVerified}`);
  lines.push(
    `    Sequence range: ${report.stats.sequenceRange.start} - ${report.stats.sequenceRange.end}`
  );
  if (report.stats.timeRange) {
    lines.push(
      `    Time range: ${report.stats.timeRange.start.toISOString()} - ${report.stats.timeRange.end.toISOString()}`
    );
  }
  lines.push(`    Continuity: ${report.stats.continuityPercent}%`);
  lines.push(`    Gaps detected: ${report.stats.gapsDetected}`);
  lines.push(`    Missing entries: ${report.stats.missingEntries}`);
  lines.push(`    Hash algorithms: ${report.stats.algorithmsUsed.join(', ') || 'N/A'}`);
  lines.push('');

  // Issues
  if (report.issues.length > 0) {
    lines.push(chalk.bold(`  Issues (${report.issues.length}):`));
    lines.push('');

    // Group by severity
    const criticalIssues = report.issues.filter((i) => i.severity === 'critical');
    const highIssues = report.issues.filter((i) => i.severity === 'high');
    const mediumIssues = report.issues.filter((i) => i.severity === 'medium');
    const lowIssues = report.issues.filter((i) => i.severity === 'low');

    if (criticalIssues.length > 0) {
      lines.push(chalk.red.bold(`    CRITICAL (${criticalIssues.length}):`));
      for (const issue of criticalIssues) {
        lines.push(formatIssue(issue, verbose));
      }
      lines.push('');
    }

    if (highIssues.length > 0) {
      lines.push(chalk.red(`    HIGH (${highIssues.length}):`));
      for (const issue of highIssues) {
        lines.push(formatIssue(issue, verbose));
      }
      lines.push('');
    }

    if (mediumIssues.length > 0) {
      lines.push(chalk.yellow(`    MEDIUM (${mediumIssues.length}):`));
      for (const issue of mediumIssues) {
        lines.push(formatIssue(issue, verbose));
      }
      lines.push('');
    }

    if (lowIssues.length > 0) {
      lines.push(chalk.dim(`    LOW (${lowIssues.length}):`));
      for (const issue of lowIssues) {
        lines.push(formatIssue(issue, verbose));
      }
      lines.push('');
    }
  }

  // Entry details (if requested)
  if (verbose && report.entryDetails?.length) {
    lines.push(chalk.bold(`  Entry Details (${report.entryDetails.length}):`));
    for (const detail of report.entryDetails.slice(0, 10)) {
      const isValid = detail.contentHashValid && detail.chainLinkValid;
      const statusIcon = isValid ? chalk.green('✓') : chalk.red('✗');
      lines.push(
        `    ${statusIcon} Seq ${detail.sequence}: content=${detail.contentHashValid ? 'OK' : 'FAIL'}, chain=${detail.chainLinkValid ? 'OK' : 'FAIL'}`
      );
    }
    if (report.entryDetails.length > 10) {
      lines.push(chalk.dim(`    ... and ${report.entryDetails.length - 10} more`));
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * gwi audit verify - Verify audit log chain integrity
 */
export async function auditVerifyCommand(options: AuditVerifyOptions): Promise<void> {
  const tenantId = options.tenant ?? 'default';

  // Create store and verification service
  // In production, this would connect to the actual storage backend
  const store = createInMemoryAuditLogStore();
  const service = createAuditVerificationService(store);

  // Build verification options
  const verificationOptions = {
    startSequence: options.startSequence,
    endSequence: options.endSequence,
    maxEntries: options.maxEntries,
    verifyTimestamps: options.verifyTimestamps ?? false,
    includeEntryDetails: options.includeDetails ?? options.verbose ?? false,
    stopOnFirstError: options.stopOnFirstError ?? false,
  };

  try {
    // Run verification
    const report = await service.verify(tenantId, verificationOptions);

    // Output as JSON if requested
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // Human-readable output
    console.log(formatReport(report, options.verbose ?? false));

    // Exit with appropriate code
    if (!report.valid) {
      process.exit(1);
    }
  } catch (error) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            error: error instanceof Error ? error.message : String(error),
            tenantId,
          },
          null,
          2
        )
      );
    } else {
      console.error(
        chalk.red('  Error verifying audit log:'),
        error instanceof Error ? error.message : String(error)
      );
    }
    process.exit(1);
  }
}

/**
 * gwi audit health - Quick health check (no detailed verification)
 */
export async function auditHealthCommand(options: {
  tenant?: string;
  json?: boolean;
}): Promise<void> {
  const tenantId = options.tenant ?? 'default';

  // Create store and verification service
  const store = createInMemoryAuditLogStore();
  const service = createAuditVerificationService(store);

  try {
    const health = await service.getChainHealth(tenantId);

    if (options.json) {
      console.log(JSON.stringify(health, null, 2));
      return;
    }

    if (!health) {
      console.log('');
      console.log(chalk.yellow('  No audit log found for tenant:'), tenantId);
      console.log('');
      return;
    }

    console.log('');
    console.log(chalk.bold('  Audit Log Health'));
    console.log(chalk.dim('  ─────────────────────────────────────────────────────'));
    console.log('');
    console.log(`    Tenant: ${tenantId}`);
    console.log(`    Total entries: ${health.totalEntries}`);
    console.log(
      `    Sequence range: ${health.sequenceRange.start} - ${health.sequenceRange.end}`
    );
    console.log(`    Continuity: ${health.continuityPercent}%`);
    console.log(`    Potential gaps: ${health.gapsDetected}`);
    console.log(`    Hash algorithms: ${health.algorithmsUsed.join(', ') || 'N/A'}`);
    console.log('');

    if (health.gapsDetected > 0) {
      console.log(
        chalk.yellow('  Warning:'),
        `Detected ${health.gapsDetected} potential gaps. Run 'gwi audit verify' for details.`
      );
      console.log('');
    }
  } catch (error) {
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            error: error instanceof Error ? error.message : String(error),
            tenantId,
          },
          null,
          2
        )
      );
    } else {
      console.error(
        chalk.red('  Error checking audit log health:'),
        error instanceof Error ? error.message : String(error)
      );
    }
    process.exit(1);
  }
}

/**
 * gwi audit is-valid - Quick boolean check (for scripts/CI)
 */
export async function auditIsValidCommand(options: {
  tenant?: string;
  quiet?: boolean;
}): Promise<void> {
  const tenantId = options.tenant ?? 'default';

  // Create store and verification service
  const store = createInMemoryAuditLogStore();
  const service = createAuditVerificationService(store);

  try {
    const isValid = await service.isChainValid(tenantId);

    if (!options.quiet) {
      console.log(isValid ? 'valid' : 'invalid');
    }

    process.exit(isValid ? 0 : 1);
  } catch (error) {
    if (!options.quiet) {
      console.error('error');
    }
    process.exit(2);
  }
}
