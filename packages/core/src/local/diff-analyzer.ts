/**
 * Local Diff Analyzer (Epic J - J2.1)
 *
 * Analyzes local git diffs for complexity, patterns, and review insights.
 * Works entirely offline without GitHub API.
 *
 * @module @gwi/core/local
 */

import type { LocalChanges, FileChange, FileDiff } from './change-reader.js';

// =============================================================================
// Types
// =============================================================================

/**
 * File categorization for review priority
 */
export type FileCategory =
  | 'source'       // Main source code
  | 'test'         // Test files
  | 'config'       // Configuration files
  | 'docs'         // Documentation
  | 'build'        // Build/CI files
  | 'dependency'   // Package manifests
  | 'generated'    // Auto-generated files
  | 'asset'        // Binary/media assets
  | 'unknown';

/**
 * Risk level for a change
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Analysis of a single file
 */
export interface FileAnalysis {
  /** File path */
  path: string;
  /** File category */
  category: FileCategory;
  /** Language (if detectable) */
  language?: string;
  /** Risk level */
  riskLevel: RiskLevel;
  /** Risk factors detected */
  riskFactors: string[];
  /** Lines added */
  additions: number;
  /** Lines removed */
  deletions: number;
  /** Net change (additions - deletions) */
  netChange: number;
  /** Complexity score (0-10) */
  complexity: number;
  /** Review priority (1 = highest) */
  reviewPriority: number;
  /** Suggestions for review */
  suggestions: string[];
}

/**
 * Pattern detected in changes
 */
export interface ChangePattern {
  /** Pattern type */
  type: string;
  /** Description */
  description: string;
  /** Files matching this pattern */
  files: string[];
  /** Severity */
  severity: 'info' | 'warning' | 'error';
}

/**
 * Complete diff analysis result
 */
export interface DiffAnalysis {
  /** Analyzed changes */
  changes: LocalChanges;
  /** File-by-file analysis */
  files: FileAnalysis[];
  /** Overall complexity score (0-10) */
  overallComplexity: number;
  /** Overall risk level */
  overallRisk: RiskLevel;
  /** Detected patterns */
  patterns: ChangePattern[];
  /** Summary statistics */
  stats: {
    totalFiles: number;
    sourceFiles: number;
    testFiles: number;
    configFiles: number;
    totalAdditions: number;
    totalDeletions: number;
    avgFileComplexity: number;
    maxFileComplexity: number;
  };
  /** Review recommendations */
  recommendations: string[];
  /** Analysis timestamp */
  analyzedAt: Date;
}

// =============================================================================
// File Categorization
// =============================================================================

const CATEGORY_PATTERNS: Record<FileCategory, RegExp[]> = {
  test: [
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
    /__tests__\//,
    /test\//,
    /tests\//,
    /\.test\.py$/,
    /_test\.go$/,
    /\.test\.rs$/,
  ],
  config: [
    /\.json$/,
    /\.ya?ml$/,
    /\.toml$/,
    /\.ini$/,
    /\.env/,
    /\.config\.[jt]s$/,
    /tsconfig.*\.json$/,
    /\.eslintrc/,
    /\.prettierrc/,
    /vitest\.config/,
    /jest\.config/,
  ],
  docs: [
    /\.md$/,
    /\.mdx$/,
    /\.rst$/,
    /\.txt$/,
    /docs\//,
    /README/i,
    /CHANGELOG/i,
    /LICENSE/i,
  ],
  build: [
    /Dockerfile/,
    /docker-compose/,
    /\.github\//,
    /\.gitlab-ci/,
    /Makefile/,
    /\.tf$/,
    /\.tfvars$/,
    /cloudbuild/,
  ],
  dependency: [
    /package\.json$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /Cargo\.toml$/,
    /Cargo\.lock$/,
    /go\.mod$/,
    /go\.sum$/,
    /requirements\.txt$/,
    /Gemfile/,
    /composer\.json$/,
  ],
  generated: [
    /\.d\.ts$/,
    /generated\//,
    /\.gen\.[jt]sx?$/,
    /\.pb\./,
    /swagger.*\.json$/,
    /openapi.*\.json$/,
  ],
  asset: [
    /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i,
    /\.(mp3|wav|ogg|mp4|webm)$/i,
    /\.(woff2?|ttf|eot)$/i,
    /\.(pdf|zip|tar|gz)$/i,
  ],
  source: [], // Default category
  unknown: [],
};

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.swift': 'swift',
  '.scala': 'scala',
  '.sh': 'shell',
  '.bash': 'shell',
  '.sql': 'sql',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.vue': 'vue',
  '.svelte': 'svelte',
};

/**
 * Categorize a file by its path
 */
export function categorizeFile(path: string): FileCategory {
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(path))) {
      return category as FileCategory;
    }
  }

  // Default to source for code files
  const ext = path.match(/\.[^.]+$/)?.[0] ?? '';
  if (LANGUAGE_EXTENSIONS[ext]) {
    return 'source';
  }

  return 'unknown';
}

/**
 * Detect language from file extension
 */
export function detectLanguage(path: string): string | undefined {
  const ext = path.match(/\.[^.]+$/)?.[0] ?? '';
  return LANGUAGE_EXTENSIONS[ext];
}

// =============================================================================
// Risk Analysis
// =============================================================================

const RISK_PATTERNS = {
  critical: [
    { pattern: /password|secret|api[_-]?key|token|credential/i, reason: 'Potential secret exposure' },
    { pattern: /\beval\s*\(/i, reason: 'eval() usage detected' },
    { pattern: /innerHTML\s*=/i, reason: 'Direct innerHTML assignment (XSS risk)' },
    { pattern: /dangerouslySetInnerHTML/i, reason: 'React dangerouslySetInnerHTML usage' },
    { pattern: /exec\s*\(/i, reason: 'Shell exec usage' },
    { pattern: /\$\{.*\}.*exec|exec.*\$\{/i, reason: 'Command injection risk' },
  ],
  high: [
    { pattern: /TODO:|FIXME:|HACK:|XXX:/i, reason: 'TODO/FIXME comment found' },
    { pattern: /console\.(log|debug|info)\(/i, reason: 'Console logging in code' },
    { pattern: /debugger;/i, reason: 'Debugger statement' },
    { pattern: /disable.*eslint|eslint-disable/i, reason: 'ESLint rules disabled' },
    { pattern: /@ts-ignore|@ts-nocheck/i, reason: 'TypeScript checks disabled' },
    { pattern: /any\s*[;,)>]/i, reason: 'Explicit any type' },
  ],
  medium: [
    { pattern: /catch\s*\(\s*\)\s*\{/i, reason: 'Empty catch block' },
    { pattern: /\.bind\(this\)/i, reason: 'Manual this binding' },
    { pattern: /new\s+Promise\(/i, reason: 'Manual Promise construction' },
    { pattern: /setTimeout|setInterval/i, reason: 'Timer usage' },
  ],
};

/**
 * Analyze risk factors in diff content
 */
function analyzeRiskFactors(diff: string): { level: RiskLevel; factors: string[] } {
  const factors: string[] = [];
  let maxLevel: RiskLevel = 'low';

  // Only check added lines (starting with +)
  const addedLines = diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .join('\n');

  for (const { pattern, reason } of RISK_PATTERNS.critical) {
    if (pattern.test(addedLines)) {
      factors.push(reason);
      maxLevel = 'critical';
    }
  }

  for (const { pattern, reason } of RISK_PATTERNS.high) {
    if (pattern.test(addedLines)) {
      factors.push(reason);
      if (maxLevel !== 'critical') maxLevel = 'high';
    }
  }

  for (const { pattern, reason } of RISK_PATTERNS.medium) {
    if (pattern.test(addedLines)) {
      factors.push(reason);
      if (maxLevel === 'low') maxLevel = 'medium';
    }
  }

  return { level: maxLevel, factors: [...new Set(factors)] };
}

// =============================================================================
// Complexity Scoring
// =============================================================================

/**
 * Calculate complexity score for a file (0-10)
 */
export function calculateFileComplexity(file: FileChange, diff?: FileDiff): number {
  let score = 0;

  // Size factor (more lines = more complex)
  const totalLines = file.additions + file.deletions;
  if (totalLines > 500) score += 3;
  else if (totalLines > 200) score += 2;
  else if (totalLines > 50) score += 1;

  // Churn factor (lots of both adds and deletes = refactoring)
  const churnRatio = Math.min(file.additions, file.deletions) / Math.max(file.additions, file.deletions, 1);
  if (churnRatio > 0.7) score += 2; // Heavy refactoring
  else if (churnRatio > 0.3) score += 1;

  // Hunk count factor (scattered changes = more complex)
  if (diff?.hunks) {
    if (diff.hunks.length > 10) score += 2;
    else if (diff.hunks.length > 5) score += 1;
  }

  // Binary files are simple to review (just accept/reject)
  if (file.binary) {
    return 1;
  }

  // Cap at 10
  return Math.min(10, score);
}

/**
 * Calculate overall complexity score
 */
function calculateOverallComplexity(files: FileAnalysis[]): number {
  if (files.length === 0) return 0;

  // Weighted average based on file size
  let totalWeight = 0;
  let weightedSum = 0;

  for (const file of files) {
    const weight = file.additions + file.deletions + 1;
    totalWeight += weight;
    weightedSum += file.complexity * weight;
  }

  const avgComplexity = weightedSum / totalWeight;

  // Bonus for many files
  const fileCountBonus = Math.min(2, Math.floor(files.length / 5));

  return Math.min(10, avgComplexity + fileCountBonus);
}

// =============================================================================
// Pattern Detection
// =============================================================================

/**
 * Detect patterns in the changes
 */
function detectPatterns(changes: LocalChanges, fileAnalyses: FileAnalysis[]): ChangePattern[] {
  const patterns: ChangePattern[] = [];

  // Large PR pattern
  if (changes.totalAdditions + changes.totalDeletions > 500) {
    patterns.push({
      type: 'large_change',
      description: `Large change set (${changes.totalAdditions + changes.totalDeletions} lines)`,
      files: changes.files.map((f) => f.path),
      severity: changes.totalAdditions + changes.totalDeletions > 1000 ? 'warning' : 'info',
    });
  }

  // No tests pattern
  const sourceFiles = fileAnalyses.filter((f) => f.category === 'source');
  const testFiles = fileAnalyses.filter((f) => f.category === 'test');
  if (sourceFiles.length > 0 && testFiles.length === 0) {
    patterns.push({
      type: 'no_tests',
      description: 'Source changes without corresponding tests',
      files: sourceFiles.map((f) => f.path),
      severity: 'warning',
    });
  }

  // Config-only pattern
  const configFiles = fileAnalyses.filter((f) => f.category === 'config');
  if (configFiles.length > 0 && sourceFiles.length === 0) {
    patterns.push({
      type: 'config_only',
      description: 'Configuration changes only',
      files: configFiles.map((f) => f.path),
      severity: 'info',
    });
  }

  // Dependency changes pattern
  const depFiles = fileAnalyses.filter((f) => f.category === 'dependency');
  if (depFiles.length > 0) {
    patterns.push({
      type: 'dependency_change',
      description: 'Dependency changes detected',
      files: depFiles.map((f) => f.path),
      severity: 'warning',
    });
  }

  // Many small files pattern
  const smallFiles = fileAnalyses.filter((f) => f.additions + f.deletions < 10);
  if (smallFiles.length > 5) {
    patterns.push({
      type: 'many_small_changes',
      description: `Many small changes across ${smallFiles.length} files`,
      files: smallFiles.map((f) => f.path),
      severity: 'info',
    });
  }

  // High risk files pattern
  const highRiskFiles = fileAnalyses.filter((f) => f.riskLevel === 'high' || f.riskLevel === 'critical');
  if (highRiskFiles.length > 0) {
    patterns.push({
      type: 'high_risk_changes',
      description: `${highRiskFiles.length} file(s) with high-risk changes`,
      files: highRiskFiles.map((f) => f.path),
      severity: 'error',
    });
  }

  return patterns;
}

// =============================================================================
// Recommendations
// =============================================================================

/**
 * Generate review recommendations
 */
function generateRecommendations(analysis: {
  files: FileAnalysis[];
  patterns: ChangePattern[];
  overallComplexity: number;
  overallRisk: RiskLevel;
}): string[] {
  const recommendations: string[] = [];

  // Risk-based recommendations
  if (analysis.overallRisk === 'critical') {
    recommendations.push('CRITICAL: Security-sensitive changes detected. Careful review required.');
  } else if (analysis.overallRisk === 'high') {
    recommendations.push('High-risk changes detected. Consider additional review.');
  }

  // Complexity recommendations
  if (analysis.overallComplexity > 7) {
    recommendations.push('Consider breaking this change into smaller, focused commits.');
  }

  // Pattern-based recommendations
  for (const pattern of analysis.patterns) {
    switch (pattern.type) {
      case 'no_tests':
        recommendations.push('Add tests for the source code changes.');
        break;
      case 'dependency_change':
        recommendations.push('Review dependency changes for security and compatibility.');
        break;
      case 'large_change':
        recommendations.push('Large changeset - consider incremental review strategy.');
        break;
    }
  }

  // File-specific recommendations
  const filesWithSuggestions = analysis.files.filter((f) => f.suggestions.length > 0);
  if (filesWithSuggestions.length > 0) {
    recommendations.push(`${filesWithSuggestions.length} file(s) have specific review suggestions.`);
  }

  return recommendations;
}

// =============================================================================
// Main Analyzer
// =============================================================================

/**
 * Analyze local changes for review
 */
export async function analyzeDiff(changes: LocalChanges): Promise<DiffAnalysis> {
  const fileAnalyses: FileAnalysis[] = [];

  for (const file of changes.files) {
    const fileDiff = changes.fileDiffs.find((d) => d.path === file.path);
    const category = categorizeFile(file.path);
    const language = detectLanguage(file.path);
    const complexity = calculateFileComplexity(file, fileDiff);

    // Analyze risk if we have diff content
    let riskLevel: RiskLevel = 'low';
    let riskFactors: string[] = [];
    if (fileDiff?.diff) {
      const riskAnalysis = analyzeRiskFactors(fileDiff.diff);
      riskLevel = riskAnalysis.level;
      riskFactors = riskAnalysis.factors;
    }

    // Generate suggestions
    const suggestions: string[] = [];
    if (riskFactors.length > 0) {
      suggestions.push(`Review: ${riskFactors.join(', ')}`);
    }
    if (category === 'source' && complexity > 5) {
      suggestions.push('Complex file - consider breaking down changes');
    }

    // Calculate review priority (lower = higher priority)
    let reviewPriority = 5;
    if (riskLevel === 'critical') reviewPriority = 1;
    else if (riskLevel === 'high') reviewPriority = 2;
    else if (category === 'source') reviewPriority = 3;
    else if (category === 'test') reviewPriority = 4;

    fileAnalyses.push({
      path: file.path,
      category,
      language,
      riskLevel,
      riskFactors,
      additions: file.additions,
      deletions: file.deletions,
      netChange: file.additions - file.deletions,
      complexity,
      reviewPriority,
      suggestions,
    });
  }

  // Sort by review priority
  fileAnalyses.sort((a, b) => a.reviewPriority - b.reviewPriority);

  // Calculate overall metrics
  const overallComplexity = calculateOverallComplexity(fileAnalyses);
  const overallRisk = fileAnalyses.reduce<RiskLevel>((max, f) => {
    const levels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    return levels.indexOf(f.riskLevel) > levels.indexOf(max) ? f.riskLevel : max;
  }, 'low');

  // Detect patterns
  const patterns = detectPatterns(changes, fileAnalyses);

  // Generate recommendations
  const recommendations = generateRecommendations({
    files: fileAnalyses,
    patterns,
    overallComplexity,
    overallRisk,
  });

  // Calculate stats
  const stats = {
    totalFiles: fileAnalyses.length,
    sourceFiles: fileAnalyses.filter((f) => f.category === 'source').length,
    testFiles: fileAnalyses.filter((f) => f.category === 'test').length,
    configFiles: fileAnalyses.filter((f) => f.category === 'config').length,
    totalAdditions: changes.totalAdditions,
    totalDeletions: changes.totalDeletions,
    avgFileComplexity: fileAnalyses.length > 0
      ? fileAnalyses.reduce((sum, f) => sum + f.complexity, 0) / fileAnalyses.length
      : 0,
    maxFileComplexity: fileAnalyses.length > 0
      ? Math.max(...fileAnalyses.map((f) => f.complexity))
      : 0,
  };

  return {
    changes,
    files: fileAnalyses,
    overallComplexity: Math.round(overallComplexity * 10) / 10,
    overallRisk,
    patterns,
    stats,
    recommendations,
    analyzedAt: new Date(),
  };
}

/**
 * Quick complexity score without full analysis
 */
export function quickComplexityScore(changes: LocalChanges): number {
  let score = 0;

  // File count
  const fileCount = changes.files.length;
  if (fileCount > 20) score += 3;
  else if (fileCount > 10) score += 2;
  else if (fileCount > 5) score += 1;

  // Line count
  const lineCount = changes.totalAdditions + changes.totalDeletions;
  if (lineCount > 500) score += 3;
  else if (lineCount > 200) score += 2;
  else if (lineCount > 50) score += 1;

  // Source file ratio
  const sourceFiles = changes.files.filter((f) => categorizeFile(f.path) === 'source');
  if (sourceFiles.length > fileCount * 0.5) score += 1;

  return Math.min(10, score);
}
