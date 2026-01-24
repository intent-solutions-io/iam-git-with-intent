/**
 * Local Review Module (Epic J: Local Dev Review)
 *
 * Provides offline code review capabilities for local git changes.
 * Works without GitHub API - analyzes staged, unstaged, and commit diffs.
 *
 * Target Commands:
 * - gwi review --local    : Review staged/unstaged changes
 * - gwi triage --diff     : Score commit complexity
 * - gwi explain .         : Summarize what changed
 * - gwi gate              : Pre-commit review gate
 *
 * @module @gwi/core/local
 */

// Change Reader - Git operations for reading local changes
export {
  // Types
  type ChangeType,
  type FileStatus,
  type FileChange,
  type FileDiff,
  type DiffHunk,
  type LocalChanges,
  type ChangeReaderOptions,
  // Git helpers
  findRepoRoot,
  isGitRepository,
  getCurrentBranch,
  getHeadCommit,
  getShortCommit,
  refExists,
  // File operations
  getStagedFiles,
  getUnstagedFiles,
  getUntrackedFiles,
  // Main readers
  readStagedChanges,
  readUnstagedChanges,
  readAllChanges,
  readCommitChanges,
  readRangeChanges,
  readChanges,
  // Quick summary
  getChangeSummary,
} from './change-reader.js';

// Diff Analyzer - Complexity and risk analysis
export {
  // Types
  type FileCategory,
  type RiskLevel,
  type FileAnalysis,
  type ChangePattern,
  type DiffAnalysis,
  // Categorization
  categorizeFile,
  detectLanguage,
  // Complexity
  calculateFileComplexity,
  quickComplexityScore,
  // Main analyzer
  analyzeDiff,
} from './diff-analyzer.js';

// Local Explainer - Human-readable output formatting
export {
  // Types
  type ExplainFormat,
  type ExplainVerbosity,
  type FileExplanation,
  type ChangeExplanation,
  // Explain generation
  explainChanges,
  quickExplain,
  // Formatters
  formatExplanation,
  formatExplanationText,
  formatExplanationMarkdown,
  formatExplanationJson,
} from './local-explainer.js';

// Local Scorer - Deterministic complexity scoring
export {
  // Types
  type LocalComplexityScore,
  type LocalRubricTag,
  type LocalScoreResult,
  type LocalTriageResult,
  // Scoring
  scoreLocalChanges,
  scoreFromAnalysis,
  clampScore,
  scoreToRiskLevel,
  quickScore,
  // Triage
  triageLocalChanges,
} from './local-scorer.js';
