/**
 * Quality Analyzer
 *
 * Assesses the actual value of PR changes.
 * Detects cosmetic-only changes, comment spam,
 * README inflation, and other low-value patterns.
 */

import type { SlopAnalysisInput, AnalyzerResult, SlopSignal, QualitySignal } from '../types.js';

/**
 * Quality signals and their weights
 */
const QUALITY_SIGNALS: Record<string, QualitySignal> = {
  cosmeticOnly: {
    name: 'cosmetic_only',
    weight: 20,
    description: 'Changes are purely cosmetic (whitespace, formatting)',
  },
  commentSpam: {
    name: 'comment_spam',
    weight: 25,
    description: 'Adds comments stating the obvious',
  },
  readmeInflation: {
    name: 'readme_inflation',
    weight: 15,
    description: 'Unnecessary README/doc changes without substance',
  },
  noFunctionalChange: {
    name: 'no_functional_change',
    weight: 20,
    description: 'Changes do not affect runtime behavior',
  },
  testlessFeature: {
    name: 'testless_feature',
    weight: 10,
    description: 'New code added without corresponding tests',
  },
  tinyChange: {
    name: 'tiny_change',
    weight: 8,
    description: 'Trivially small change (likely typo fix)',
  },
  markdownOnly: {
    name: 'markdown_only',
    weight: 12,
    description: 'Only markdown files modified',
  },
};

/**
 * Analyze the quality/value of PR changes
 */
export function analyzeQuality(input: SlopAnalysisInput): AnalyzerResult {
  const signals: SlopSignal[] = [];
  let totalWeight = 0;

  // Parse diff to understand changes
  const diffAnalysis = analyzeDiff(input.diff);
  const fileAnalysis = analyzeFiles(input.files);

  // Check for cosmetic-only changes
  if (diffAnalysis.isCosmeticOnly) {
    const signal: SlopSignal = {
      type: 'quality',
      signal: QUALITY_SIGNALS.cosmeticOnly.name,
      weight: QUALITY_SIGNALS.cosmeticOnly.weight,
      evidence: 'Changes are whitespace, formatting, or style only',
    };
    signals.push(signal);
    totalWeight += signal.weight;
  }

  // Check for comment spam
  if (diffAnalysis.commentAdditionRatio > 0.5 && diffAnalysis.totalAdditions > 5) {
    const signal: SlopSignal = {
      type: 'quality',
      signal: QUALITY_SIGNALS.commentSpam.name,
      weight: QUALITY_SIGNALS.commentSpam.weight,
      evidence: `${Math.round(diffAnalysis.commentAdditionRatio * 100)}% of additions are comments`,
    };
    signals.push(signal);
    totalWeight += signal.weight;
  }

  // Check for README inflation
  if (fileAnalysis.hasReadmeChanges && !fileAnalysis.hasCodeChanges) {
    const signal: SlopSignal = {
      type: 'quality',
      signal: QUALITY_SIGNALS.readmeInflation.name,
      weight: QUALITY_SIGNALS.readmeInflation.weight,
      evidence: 'Only README/documentation changes, no code',
    };
    signals.push(signal);
    totalWeight += signal.weight;
  }

  // Check for markdown-only changes
  if (fileAnalysis.isMarkdownOnly && fileAnalysis.fileCount > 0) {
    const signal: SlopSignal = {
      type: 'quality',
      signal: QUALITY_SIGNALS.markdownOnly.name,
      weight: QUALITY_SIGNALS.markdownOnly.weight,
      evidence: `All ${fileAnalysis.fileCount} changed files are markdown`,
    };
    signals.push(signal);
    totalWeight += signal.weight;
  }

  // Check for no functional change (only renames, type annotations, etc.)
  if (diffAnalysis.isNoFunctionalChange) {
    const signal: SlopSignal = {
      type: 'quality',
      signal: QUALITY_SIGNALS.noFunctionalChange.name,
      weight: QUALITY_SIGNALS.noFunctionalChange.weight,
      evidence: 'Changes appear to have no runtime effect',
    };
    signals.push(signal);
    totalWeight += signal.weight;
  }

  // Check for testless feature
  if (fileAnalysis.hasNewCode && !fileAnalysis.hasTestChanges) {
    const signal: SlopSignal = {
      type: 'quality',
      signal: QUALITY_SIGNALS.testlessFeature.name,
      weight: QUALITY_SIGNALS.testlessFeature.weight,
      evidence: 'New code added without test coverage',
    };
    signals.push(signal);
    totalWeight += signal.weight;
  }

  // Check for tiny changes
  if (diffAnalysis.totalAdditions < 5 && diffAnalysis.totalDeletions < 5) {
    const signal: SlopSignal = {
      type: 'quality',
      signal: QUALITY_SIGNALS.tinyChange.name,
      weight: QUALITY_SIGNALS.tinyChange.weight,
      evidence: `Only ${diffAnalysis.totalAdditions} additions, ${diffAnalysis.totalDeletions} deletions`,
    };
    signals.push(signal);
    totalWeight += signal.weight;
  }

  return { signals, totalWeight };
}

/**
 * Analysis results from diff parsing
 */
interface DiffAnalysis {
  totalAdditions: number;
  totalDeletions: number;
  commentAdditionRatio: number;
  isCosmeticOnly: boolean;
  isNoFunctionalChange: boolean;
}

/**
 * Parse and analyze diff content
 */
function analyzeDiff(diff: string): DiffAnalysis {
  const lines = diff.split('\n');

  let additions = 0;
  let deletions = 0;
  let commentAdditions = 0;
  let whitespaceOnlyChanges = 0;
  let totalChanges = 0;
  let typeAnnotationChanges = 0;

  const commentPatterns = [
    /^\+\s*\/\//,          // JS/TS single-line
    /^\+\s*#(?!\!)/,       // Python/Shell (not shebang)
    /^\+\s*\/\*\*/,        // JSDoc start
    /^\+\s*\*/,            // JSDoc continuation
    /^\+\s*\*\//,          // JSDoc end
    /^\+\s*<!--/,          // HTML comment
    /^\+\s*"""/,           // Python docstring
  ];

  const whitespacePatterns = [
    /^\+\s*$/,             // Empty line
    /^-\s*$/,              // Removed empty line
  ];

  const typeAnnotationPatterns = [
    /^\+.*:\s*(string|number|boolean|any|void|null|undefined)/,
    /^\+.*<[A-Z]\w*>/,     // Generic type
    /^\+\s*@types?\s/,     // JSDoc type annotation
  ];

  for (const line of lines) {
    // Skip diff headers
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) {
      continue;
    }

    if (line.startsWith('+')) {
      additions++;
      totalChanges++;

      if (commentPatterns.some(p => p.test(line))) {
        commentAdditions++;
      }
      if (whitespacePatterns.some(p => p.test(line))) {
        whitespaceOnlyChanges++;
      }
      if (typeAnnotationPatterns.some(p => p.test(line))) {
        typeAnnotationChanges++;
      }
    } else if (line.startsWith('-')) {
      deletions++;
      totalChanges++;

      if (whitespacePatterns.some(p => p.test(line))) {
        whitespaceOnlyChanges++;
      }
    }
  }

  // Calculate ratios
  const commentRatio = additions > 0 ? commentAdditions / additions : 0;
  const whitespaceRatio = totalChanges > 0 ? whitespaceOnlyChanges / totalChanges : 0;
  const typeAnnotationRatio = additions > 0 ? typeAnnotationChanges / additions : 0;

  return {
    totalAdditions: additions,
    totalDeletions: deletions,
    commentAdditionRatio: commentRatio,
    isCosmeticOnly: whitespaceRatio > 0.8 && totalChanges > 0,
    isNoFunctionalChange: typeAnnotationRatio > 0.8 && additions > 3,
  };
}

/**
 * Analysis results from file metadata
 */
interface FileAnalysis {
  fileCount: number;
  hasReadmeChanges: boolean;
  hasCodeChanges: boolean;
  hasTestChanges: boolean;
  hasNewCode: boolean;
  isMarkdownOnly: boolean;
}

/**
 * Analyze file metadata
 */
function analyzeFiles(files: SlopAnalysisInput['files']): FileAnalysis {
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java',
    '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
  ];
  const testPatterns = [
    /\.test\./,
    /\.spec\./,
    /_test\./,
    /\/test\//,
    /\/__tests__\//,
    /\.tests\./,
  ];
  const markdownExtensions = ['.md', '.mdx', '.markdown'];
  const readmePatterns = [/readme/i, /contributing/i, /changelog/i];

  let hasReadmeChanges = false;
  let hasCodeChanges = false;
  let hasTestChanges = false;
  let hasNewCode = false;
  let markdownCount = 0;

  for (const file of files) {
    const path = file.path.toLowerCase();

    // Check for README-like files
    if (readmePatterns.some(p => p.test(path))) {
      hasReadmeChanges = true;
    }

    // Check for code files
    if (codeExtensions.some(ext => path.endsWith(ext))) {
      // Exclude test files from "code changes"
      if (!testPatterns.some(p => p.test(path))) {
        hasCodeChanges = true;
        if (file.additions > file.deletions) {
          hasNewCode = true;
        }
      }
    }

    // Check for test files
    if (testPatterns.some(p => p.test(path))) {
      hasTestChanges = true;
    }

    // Check for markdown
    if (markdownExtensions.some(ext => path.endsWith(ext))) {
      markdownCount++;
    }
  }

  return {
    fileCount: files.length,
    hasReadmeChanges,
    hasCodeChanges,
    hasTestChanges,
    hasNewCode,
    isMarkdownOnly: markdownCount === files.length && files.length > 0,
  };
}
