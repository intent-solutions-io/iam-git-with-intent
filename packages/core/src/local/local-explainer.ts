/**
 * Local Change Explainer (Epic J - J1.3)
 *
 * Formats local change analysis for human-readable CLI output.
 * Provides "what changed and why" summaries.
 *
 * @module @gwi/core/local
 */

import type { LocalChanges } from './change-reader.js';
import type {
  DiffAnalysis,
  FileAnalysis,
  FileCategory,
  RiskLevel,
} from './diff-analyzer.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Output format for explain command
 */
export type ExplainFormat = 'text' | 'json' | 'markdown';

/**
 * Verbosity level for explanations
 */
export type ExplainVerbosity = 'brief' | 'normal' | 'detailed';

/**
 * File change summary for explanation
 */
export interface FileExplanation {
  /** File path */
  path: string;
  /** Category (source, test, config, etc.) */
  category: FileCategory;
  /** One-line description of what changed */
  summary: string;
  /** Risk level */
  risk: RiskLevel;
  /** Complexity score */
  complexity: number;
  /** Additions/deletions summary */
  delta: string;
}

/**
 * Overall change explanation
 */
export interface ChangeExplanation {
  /** One-line summary of all changes */
  headline: string;
  /** Branch and commit context */
  context: {
    branch: string;
    commit: string;
    changeType: string;
  };
  /** Statistics summary */
  stats: {
    files: number;
    additions: number;
    deletions: number;
    complexity: number;
    risk: RiskLevel;
  };
  /** Category breakdown */
  breakdown: {
    category: FileCategory;
    count: number;
    additions: number;
    deletions: number;
  }[];
  /** Individual file explanations */
  files: FileExplanation[];
  /** Detected patterns */
  patterns: {
    type: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
  }[];
  /** Recommendations */
  recommendations: string[];
}

// =============================================================================
// Explanation Generation
// =============================================================================

/**
 * Generate a one-line summary for a file change
 */
function summarizeFileChange(file: FileAnalysis): string {
  const action = file.additions > file.deletions
    ? 'added'
    : file.deletions > file.additions
      ? 'removed'
      : 'modified';

  const scope = file.language ?? file.category;
  const lines = Math.abs(file.netChange);

  if (file.category === 'test') {
    return `${action} ${lines} lines of tests`;
  }

  if (file.category === 'config') {
    return `${action} configuration`;
  }

  if (file.category === 'docs') {
    return `${action} documentation`;
  }

  if (file.category === 'dependency') {
    return 'updated dependencies';
  }

  if (file.riskFactors.length > 0) {
    return `${action} ${lines} lines (${file.riskFactors[0]})`;
  }

  return `${action} ${lines} lines of ${scope}`;
}

/**
 * Generate headline for changes
 */
function generateHeadline(analysis: DiffAnalysis): string {
  const { stats, overallRisk, patterns } = analysis;

  // Check for specific patterns first
  const noTests = patterns.find((p) => p.type === 'no_tests');
  const highRisk = patterns.find((p) => p.type === 'high_risk_changes');
  const largeChange = patterns.find((p) => p.type === 'large_change');

  if (highRisk) {
    return `${stats.totalFiles} file(s) with ${overallRisk} risk changes`;
  }

  if (largeChange && stats.sourceFiles > 0) {
    return `Large change: ${stats.totalAdditions + stats.totalDeletions} lines across ${stats.totalFiles} files`;
  }

  if (noTests && stats.sourceFiles > 0) {
    return `${stats.sourceFiles} source file(s) modified without tests`;
  }

  if (stats.sourceFiles === 0 && stats.configFiles > 0) {
    return `Configuration changes only (${stats.configFiles} file(s))`;
  }

  if (stats.testFiles > 0 && stats.sourceFiles === 0) {
    return `Test changes only (${stats.testFiles} file(s))`;
  }

  // Default summary
  const netLines = stats.totalAdditions - stats.totalDeletions;
  const direction = netLines > 0 ? 'added' : netLines < 0 ? 'removed' : 'changed';

  return `${Math.abs(netLines)} lines ${direction} across ${stats.totalFiles} file(s)`;
}

/**
 * Format file delta (additions/deletions)
 */
function formatDelta(additions: number, deletions: number): string {
  if (additions === 0 && deletions === 0) {
    return 'no changes';
  }
  const parts: string[] = [];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  return parts.join(' ');
}

/**
 * Get category breakdown
 */
function getCategoryBreakdown(files: FileAnalysis[]): ChangeExplanation['breakdown'] {
  const breakdown = new Map<FileCategory, { count: number; additions: number; deletions: number }>();

  for (const file of files) {
    const existing = breakdown.get(file.category) ?? { count: 0, additions: 0, deletions: 0 };
    breakdown.set(file.category, {
      count: existing.count + 1,
      additions: existing.additions + file.additions,
      deletions: existing.deletions + file.deletions,
    });
  }

  return Array.from(breakdown.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Generate change explanation from analysis
 */
export function explainChanges(analysis: DiffAnalysis): ChangeExplanation {
  const { changes, files, stats, patterns, recommendations, overallComplexity, overallRisk } = analysis;

  return {
    headline: generateHeadline(analysis),
    context: {
      branch: changes.branch,
      commit: changes.headCommit.substring(0, 7),
      changeType: changes.type,
    },
    stats: {
      files: stats.totalFiles,
      additions: stats.totalAdditions,
      deletions: stats.totalDeletions,
      complexity: overallComplexity,
      risk: overallRisk,
    },
    breakdown: getCategoryBreakdown(files),
    files: files.map((f) => ({
      path: f.path,
      category: f.category,
      summary: summarizeFileChange(f),
      risk: f.riskLevel,
      complexity: f.complexity,
      delta: formatDelta(f.additions, f.deletions),
    })),
    patterns: patterns.map((p) => ({
      type: p.type,
      message: p.description,
      severity: p.severity,
    })),
    recommendations,
  };
}

// =============================================================================
// Formatting
// =============================================================================

/**
 * Risk level colors/symbols
 */
const RISK_SYMBOLS: Record<RiskLevel, string> = {
  low: '.',
  medium: '*',
  high: '!',
  critical: '!!',
};

/**
 * Category symbols
 */
const CATEGORY_SYMBOLS: Record<FileCategory, string> = {
  source: 'src',
  test: 'tst',
  config: 'cfg',
  docs: 'doc',
  build: 'bld',
  dependency: 'dep',
  generated: 'gen',
  asset: 'ast',
  unknown: '???',
};

/**
 * Format explanation as plain text
 */
export function formatExplanationText(
  explanation: ChangeExplanation,
  verbosity: ExplainVerbosity = 'normal'
): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(`  ${explanation.headline}`);
  lines.push('');
  lines.push(`  Branch: ${explanation.context.branch} (${explanation.context.commit})`);
  lines.push(`  Type: ${explanation.context.changeType}`);
  lines.push('');

  // Stats bar
  const { stats } = explanation;
  lines.push(`  Stats: ${stats.files} files, +${stats.additions} -${stats.deletions}`);
  lines.push(`  Complexity: ${stats.complexity}/10 | Risk: ${stats.risk}`);
  lines.push('');

  // Category breakdown (brief)
  if (verbosity !== 'brief' && explanation.breakdown.length > 1) {
    lines.push('  Breakdown:');
    for (const { category, count, additions, deletions } of explanation.breakdown) {
      lines.push(`    ${CATEGORY_SYMBOLS[category]}: ${count} file(s) (+${additions} -${deletions})`);
    }
    lines.push('');
  }

  // Files (normal/detailed)
  if (verbosity !== 'brief') {
    lines.push('  Files:');
    const maxFiles = verbosity === 'detailed' ? explanation.files.length : 10;
    for (let i = 0; i < Math.min(maxFiles, explanation.files.length); i++) {
      const file = explanation.files[i];
      const risk = RISK_SYMBOLS[file.risk];
      lines.push(`    ${risk} ${file.path}`);
      if (verbosity === 'detailed') {
        lines.push(`      ${file.summary} (${file.delta})`);
      }
    }
    if (explanation.files.length > maxFiles) {
      lines.push(`    ... and ${explanation.files.length - maxFiles} more`);
    }
    lines.push('');
  }

  // Patterns (warnings/errors)
  const significantPatterns = explanation.patterns.filter((p) => p.severity !== 'info');
  if (significantPatterns.length > 0) {
    lines.push('  Patterns:');
    for (const pattern of significantPatterns) {
      const prefix = pattern.severity === 'error' ? '!' : '*';
      lines.push(`    ${prefix} ${pattern.message}`);
    }
    lines.push('');
  }

  // Recommendations
  if (verbosity !== 'brief' && explanation.recommendations.length > 0) {
    lines.push('  Recommendations:');
    for (const rec of explanation.recommendations) {
      lines.push(`    - ${rec}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format explanation as markdown
 */
export function formatExplanationMarkdown(
  explanation: ChangeExplanation,
  verbosity: ExplainVerbosity = 'normal'
): string {
  const lines: string[] = [];

  // Header
  lines.push(`## ${explanation.headline}`);
  lines.push('');
  lines.push(`**Branch:** \`${explanation.context.branch}\` @ \`${explanation.context.commit}\``);
  lines.push(`**Type:** ${explanation.context.changeType}`);
  lines.push('');

  // Stats
  const { stats } = explanation;
  lines.push('### Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Files | ${stats.files} |`);
  lines.push(`| Additions | +${stats.additions} |`);
  lines.push(`| Deletions | -${stats.deletions} |`);
  lines.push(`| Complexity | ${stats.complexity}/10 |`);
  lines.push(`| Risk | ${stats.risk} |`);
  lines.push('');

  // Category breakdown
  if (explanation.breakdown.length > 1) {
    lines.push('### By Category');
    lines.push('');
    lines.push('| Category | Files | Changes |');
    lines.push('|----------|-------|---------|');
    for (const { category, count, additions, deletions } of explanation.breakdown) {
      lines.push(`| ${category} | ${count} | +${additions} -${deletions} |`);
    }
    lines.push('');
  }

  // Files
  if (verbosity !== 'brief') {
    lines.push('### Changed Files');
    lines.push('');
    for (const file of explanation.files) {
      const riskBadge = file.risk === 'critical' || file.risk === 'high'
        ? ` ⚠️ ${file.risk}`
        : '';
      lines.push(`- \`${file.path}\`${riskBadge}`);
      if (verbosity === 'detailed') {
        lines.push(`  - ${file.summary} (${file.delta})`);
      }
    }
    lines.push('');
  }

  // Patterns
  const significantPatterns = explanation.patterns.filter((p) => p.severity !== 'info');
  if (significantPatterns.length > 0) {
    lines.push('### Patterns Detected');
    lines.push('');
    for (const pattern of significantPatterns) {
      const emoji = pattern.severity === 'error' ? '🔴' : '🟡';
      lines.push(`${emoji} ${pattern.message}`);
    }
    lines.push('');
  }

  // Recommendations
  if (explanation.recommendations.length > 0) {
    lines.push('### Recommendations');
    lines.push('');
    for (const rec of explanation.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format explanation as JSON
 */
export function formatExplanationJson(explanation: ChangeExplanation): string {
  return JSON.stringify(explanation, null, 2);
}

/**
 * Format explanation in requested format
 */
export function formatExplanation(
  explanation: ChangeExplanation,
  format: ExplainFormat = 'text',
  verbosity: ExplainVerbosity = 'normal'
): string {
  switch (format) {
    case 'json':
      return formatExplanationJson(explanation);
    case 'markdown':
      return formatExplanationMarkdown(explanation, verbosity);
    case 'text':
    default:
      return formatExplanationText(explanation, verbosity);
  }
}

// =============================================================================
// Quick Explain (no full analysis)
// =============================================================================

/**
 * Generate a quick one-line explanation without full analysis
 */
export function quickExplain(changes: LocalChanges): string {
  const { files, totalAdditions, totalDeletions, type, branch } = changes;

  if (files.length === 0) {
    return `No ${type} changes on ${branch}`;
  }

  const net = totalAdditions - totalDeletions;
  const direction = net > 0 ? 'added' : net < 0 ? 'removed' : 'modified';
  const lines = Math.abs(net);

  return `${type}: ${lines} lines ${direction} in ${files.length} file(s) on ${branch}`;
}
