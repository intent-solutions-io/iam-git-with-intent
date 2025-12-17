/**
 * Comment Formatter - Intent Receipt Template
 *
 * Phase 2: Provides consistent formatting for GitHub comments and check runs.
 *
 * All GWI-generated comments follow the Intent Receipt structure:
 * - Intent: What action was performed
 * - Change Summary: Summary of changes or findings
 * - Actor: Bot identity + triggering user
 * - When: Timestamp + run ID
 * - Scope: Files/targets affected
 * - Policy/Approval: Policy status
 * - Evidence: Test results, artifact links, reasoning
 *
 * @module @gwi/integrations/github/comment-formatter
 */

import { z } from 'zod';

// =============================================================================
// Comment Metadata Schema
// =============================================================================

/**
 * Comment metadata for Intent Receipt format
 */
export const CommentMetadata = z.object({
  // Why
  why: z.string().describe('Rationale for the action'),

  // What
  what: z.object({
    summary: z.string(),
    changes: z.array(z.string()).optional(),
    filesAffected: z.number().optional(),
  }),

  // Who
  who: z.object({
    bot: z.string().default('Git With Intent'),
    version: z.string().optional(),
    triggeredBy: z.string().optional(),
    workflow: z.string().optional(),
  }),

  // When
  when: z.object({
    timestamp: z.string().datetime(),
    runId: z.string(),
    durationMs: z.number().optional(),
  }),

  // Where
  where: z.object({
    files: z.array(z.string()).optional(),
    repo: z.string().optional(),
    branch: z.string().optional(),
    prNumber: z.number().optional(),
    issueNumber: z.number().optional(),
  }),

  // Evidence
  evidence: z.object({
    testsRun: z.number().optional(),
    testsPassed: z.number().optional(),
    confidence: z.number().min(0).max(100).optional(),
    artifactLinks: z.array(z.object({
      name: z.string(),
      url: z.string().optional(),
      path: z.string().optional(),
    })).optional(),
    warnings: z.array(z.string()).optional(),
    errors: z.array(z.string()).optional(),
  }).optional(),

  // Result status
  status: z.enum(['success', 'failure', 'pending', 'warning', 'info']),
});

export type CommentMetadata = z.infer<typeof CommentMetadata>;

// =============================================================================
// Check Run Summary Schema
// =============================================================================

/**
 * Check run summary data
 */
export const CheckRunSummary = z.object({
  name: z.string(),
  status: z.enum(['queued', 'in_progress', 'completed']),
  conclusion: z.enum(['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required']).optional(),
  metadata: CommentMetadata,
});

export type CheckRunSummary = z.infer<typeof CheckRunSummary>;

// =============================================================================
// Formatter Functions
// =============================================================================

/**
 * Format a comment using the Intent Receipt template
 */
export function formatComment(metadata: CommentMetadata): string {
  const lines: string[] = [];

  // Header with status icon
  const statusIcon = getStatusIcon(metadata.status);
  lines.push(`## ${statusIcon} Git With Intent`);
  lines.push('');

  // Why section
  lines.push('### Why');
  lines.push(metadata.why);
  lines.push('');

  // What section
  lines.push('### What');
  lines.push(metadata.what.summary);
  if (metadata.what.changes && metadata.what.changes.length > 0) {
    lines.push('');
    lines.push('**Changes:**');
    for (const change of metadata.what.changes) {
      lines.push(`- ${change}`);
    }
  }
  if (metadata.what.filesAffected !== undefined) {
    lines.push('');
    lines.push(`**Files affected:** ${metadata.what.filesAffected}`);
  }
  lines.push('');

  // Where section (if applicable)
  if (metadata.where.files && metadata.where.files.length > 0) {
    lines.push('### Where');
    lines.push('<details>');
    lines.push(`<summary>Files (${metadata.where.files.length})</summary>`);
    lines.push('');
    for (const file of metadata.where.files.slice(0, 20)) {
      lines.push(`- \`${file}\``);
    }
    if (metadata.where.files.length > 20) {
      lines.push(`- ... and ${metadata.where.files.length - 20} more`);
    }
    lines.push('</details>');
    lines.push('');
  }

  // Evidence section (if applicable)
  if (metadata.evidence) {
    lines.push('### Evidence');

    if (metadata.evidence.confidence !== undefined) {
      const confidenceBar = getConfidenceBar(metadata.evidence.confidence);
      lines.push(`**Confidence:** ${confidenceBar} ${metadata.evidence.confidence}%`);
      lines.push('');
    }

    if (metadata.evidence.testsRun !== undefined) {
      const testStatus = metadata.evidence.testsPassed === metadata.evidence.testsRun ? '✅' : '⚠️';
      lines.push(`**Tests:** ${testStatus} ${metadata.evidence.testsPassed ?? 0}/${metadata.evidence.testsRun} passed`);
      lines.push('');
    }

    if (metadata.evidence.artifactLinks && metadata.evidence.artifactLinks.length > 0) {
      lines.push('**Artifacts:**');
      for (const artifact of metadata.evidence.artifactLinks) {
        if (artifact.url) {
          lines.push(`- [${artifact.name}](${artifact.url})`);
        } else if (artifact.path) {
          lines.push(`- ${artifact.name}: \`${artifact.path}\``);
        } else {
          lines.push(`- ${artifact.name}`);
        }
      }
      lines.push('');
    }

    if (metadata.evidence.warnings && metadata.evidence.warnings.length > 0) {
      lines.push('**Warnings:**');
      for (const warning of metadata.evidence.warnings) {
        lines.push(`- ⚠️ ${warning}`);
      }
      lines.push('');
    }

    if (metadata.evidence.errors && metadata.evidence.errors.length > 0) {
      lines.push('**Errors:**');
      for (const error of metadata.evidence.errors) {
        lines.push(`- ❌ ${error}`);
      }
      lines.push('');
    }
  }

  // Footer with metadata
  lines.push('---');
  lines.push('<details>');
  lines.push('<summary>Metadata</summary>');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| Bot | ${metadata.who.bot}${metadata.who.version ? ` v${metadata.who.version}` : ''} |`);
  if (metadata.who.triggeredBy) {
    lines.push(`| Triggered by | @${metadata.who.triggeredBy} |`);
  }
  if (metadata.who.workflow) {
    lines.push(`| Workflow | ${metadata.who.workflow} |`);
  }
  lines.push(`| Run ID | \`${metadata.when.runId}\` |`);
  lines.push(`| Timestamp | ${metadata.when.timestamp} |`);
  if (metadata.when.durationMs !== undefined) {
    lines.push(`| Duration | ${formatDuration(metadata.when.durationMs)} |`);
  }
  if (metadata.where.repo) {
    lines.push(`| Repository | ${metadata.where.repo} |`);
  }
  if (metadata.where.branch) {
    lines.push(`| Branch | ${metadata.where.branch} |`);
  }
  lines.push('</details>');

  return lines.join('\n');
}

/**
 * Format a check run summary
 */
export function formatCheckRunSummary(summary: CheckRunSummary): { title: string; summary: string; text: string } {
  const statusIcon = getStatusIcon(summary.metadata.status);

  const title = `${statusIcon} ${summary.name}`;

  const summaryLines: string[] = [
    summary.metadata.what.summary,
    '',
  ];

  if (summary.metadata.evidence?.confidence !== undefined) {
    const bar = getConfidenceBar(summary.metadata.evidence.confidence);
    summaryLines.push(`**Confidence:** ${bar} ${summary.metadata.evidence.confidence}%`);
  }

  if (summary.metadata.evidence?.testsRun !== undefined) {
    const passed = summary.metadata.evidence.testsPassed ?? 0;
    const icon = passed === summary.metadata.evidence.testsRun ? '✅' : '⚠️';
    summaryLines.push(`**Tests:** ${icon} ${passed}/${summary.metadata.evidence.testsRun}`);
  }

  // Full text is the complete formatted comment
  const text = formatComment(summary.metadata);

  return {
    title,
    summary: summaryLines.join('\n'),
    text,
  };
}

/**
 * Create a simple info comment
 */
export function createInfoComment(
  summary: string,
  runId: string,
  details?: { files?: string[]; triggeredBy?: string; workflow?: string }
): string {
  const metadata: CommentMetadata = {
    why: 'Automated analysis by Git With Intent',
    what: {
      summary,
      filesAffected: details?.files?.length,
    },
    who: {
      bot: 'Git With Intent',
      triggeredBy: details?.triggeredBy,
      workflow: details?.workflow,
    },
    when: {
      timestamp: new Date().toISOString(),
      runId,
    },
    where: {
      files: details?.files,
    },
    status: 'info',
  };

  return formatComment(metadata);
}

/**
 * Create a success comment
 */
export function createSuccessComment(
  summary: string,
  runId: string,
  evidence?: {
    confidence?: number;
    testsRun?: number;
    testsPassed?: number;
    artifacts?: Array<{ name: string; path?: string; url?: string }>;
  },
  details?: { files?: string[]; triggeredBy?: string; workflow?: string; durationMs?: number }
): string {
  const metadata: CommentMetadata = {
    why: 'Automated processing completed successfully',
    what: {
      summary,
      filesAffected: details?.files?.length,
    },
    who: {
      bot: 'Git With Intent',
      triggeredBy: details?.triggeredBy,
      workflow: details?.workflow,
    },
    when: {
      timestamp: new Date().toISOString(),
      runId,
      durationMs: details?.durationMs,
    },
    where: {
      files: details?.files,
    },
    evidence: evidence ? {
      confidence: evidence.confidence,
      testsRun: evidence.testsRun,
      testsPassed: evidence.testsPassed,
      artifactLinks: evidence.artifacts,
    } : undefined,
    status: 'success',
  };

  return formatComment(metadata);
}

/**
 * Create an error comment
 */
export function createErrorComment(
  summary: string,
  runId: string,
  errors: string[],
  details?: { files?: string[]; triggeredBy?: string; workflow?: string }
): string {
  const metadata: CommentMetadata = {
    why: 'Automated processing encountered errors',
    what: {
      summary,
      filesAffected: details?.files?.length,
    },
    who: {
      bot: 'Git With Intent',
      triggeredBy: details?.triggeredBy,
      workflow: details?.workflow,
    },
    when: {
      timestamp: new Date().toISOString(),
      runId,
    },
    where: {
      files: details?.files,
    },
    evidence: {
      errors,
    },
    status: 'failure',
  };

  return formatComment(metadata);
}

// =============================================================================
// Helper Functions
// =============================================================================

function getStatusIcon(status: CommentMetadata['status']): string {
  switch (status) {
    case 'success':
      return '✅';
    case 'failure':
      return '❌';
    case 'pending':
      return '⏳';
    case 'warning':
      return '⚠️';
    case 'info':
    default:
      return 'ℹ️';
  }
}

function getConfidenceBar(confidence: number): string {
  const filled = Math.round(confidence / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}
