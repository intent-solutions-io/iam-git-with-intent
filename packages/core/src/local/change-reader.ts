/**
 * Local Change Reader (Epic J - J1.1, J2.2)
 *
 * Reads local git changes without requiring GitHub API.
 * Supports staged, unstaged, and commit-based diffs.
 *
 * Git Operations Reference (J1.1):
 * - git diff              : Unstaged changes (working tree vs index)
 * - git diff --cached     : Staged changes (index vs HEAD)
 * - git diff HEAD         : All uncommitted changes (working tree vs HEAD)
 * - git diff HEAD~N       : Changes since N commits ago
 * - git diff <ref>        : Changes against arbitrary ref
 * - git diff <a>..<b>     : Changes between two refs
 * - git status --porcelain: Machine-readable file status
 *
 * @module @gwi/core/local
 */

import { execSync, type ExecSyncOptions } from 'child_process';

// =============================================================================
// Types
// =============================================================================

/**
 * Type of change being analyzed
 */
export type ChangeType = 'staged' | 'unstaged' | 'all' | 'commit' | 'range';

/**
 * File change status from git
 */
export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored';

/**
 * A single file change
 */
export interface FileChange {
  /** File path relative to repo root */
  path: string;
  /** Original path (for renames/copies) */
  originalPath?: string;
  /** Change status */
  status: FileStatus;
  /** Lines added */
  additions: number;
  /** Lines removed */
  deletions: number;
  /** Whether this is a binary file */
  binary: boolean;
}

/**
 * Diff content for a file
 */
export interface FileDiff {
  /** File path */
  path: string;
  /** Original path (for renames) */
  originalPath?: string;
  /** File status */
  status: FileStatus;
  /** Unified diff content */
  diff: string;
  /** Lines added */
  additions: number;
  /** Lines removed */
  deletions: number;
  /** Whether binary */
  binary: boolean;
  /** Hunks in the diff */
  hunks: DiffHunk[];
}

/**
 * A single hunk in a diff
 */
export interface DiffHunk {
  /** Original file start line */
  oldStart: number;
  /** Original file line count */
  oldLines: number;
  /** New file start line */
  newStart: number;
  /** New file line count */
  newLines: number;
  /** Hunk content (including context) */
  content: string;
}

/**
 * Complete local change set
 */
export interface LocalChanges {
  /** Type of changes */
  type: ChangeType;
  /** Reference used (for commit/range types) */
  ref?: string;
  /** End reference (for range type) */
  endRef?: string;
  /** Repository root path */
  repoRoot: string;
  /** Current branch name */
  branch: string;
  /** Current HEAD commit */
  headCommit: string;
  /** List of changed files */
  files: FileChange[];
  /** Total additions */
  totalAdditions: number;
  /** Total deletions */
  totalDeletions: number;
  /** Combined diff content */
  combinedDiff: string;
  /** Individual file diffs */
  fileDiffs: FileDiff[];
  /** Timestamp of analysis */
  analyzedAt: Date;
}

/**
 * Options for reading changes
 */
export interface ChangeReaderOptions {
  /** Working directory (defaults to cwd) */
  cwd?: string;
  /** Include untracked files */
  includeUntracked?: boolean;
  /** Include ignored files */
  includeIgnored?: boolean;
  /** Maximum diff size in bytes (for large files) */
  maxDiffSize?: number;
  /** Context lines for diff */
  contextLines?: number;
  /** Path filter (glob patterns) */
  pathFilter?: string[];
}

// =============================================================================
// Git Command Helpers
// =============================================================================

/**
 * Execute a git command and return stdout
 */
function git(args: string[], options: { cwd: string; maxBuffer?: number }): string {
  const execOptions: ExecSyncOptions = {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 50 * 1024 * 1024, // 50MB default
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  try {
    return execSync(`git ${args.join(' ')}`, execOptions).toString();
  } catch (error) {
    const err = error as { stderr?: Buffer; message: string };
    const stderr = err.stderr?.toString() ?? '';
    throw new Error(`Git command failed: git ${args.join(' ')}\n${stderr || err.message}`);
  }
}

/**
 * Find the git repository root
 */
export function findRepoRoot(startPath: string = process.cwd()): string {
  try {
    return git(['rev-parse', '--show-toplevel'], { cwd: startPath }).trim();
  } catch {
    throw new Error(`Not a git repository: ${startPath}`);
  }
}

/**
 * Check if a path is inside a git repository
 */
export function isGitRepository(path: string): boolean {
  try {
    findRepoRoot(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current branch name
 */
export function getCurrentBranch(cwd: string): string {
  try {
    return git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }).trim();
  } catch {
    return 'HEAD'; // Detached HEAD state
  }
}

/**
 * Get current HEAD commit hash
 */
export function getHeadCommit(cwd: string): string {
  return git(['rev-parse', 'HEAD'], { cwd }).trim();
}

/**
 * Get short commit hash
 */
export function getShortCommit(cwd: string, ref: string = 'HEAD'): string {
  return git(['rev-parse', '--short', ref], { cwd }).trim();
}

/**
 * Check if ref exists
 */
export function refExists(cwd: string, ref: string): boolean {
  try {
    git(['rev-parse', '--verify', ref], { cwd });
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Change Detection
// =============================================================================

/**
 * Get list of staged files
 */
export function getStagedFiles(cwd: string): FileChange[] {
  const output = git(['diff', '--cached', '--name-status', '--no-renames'], { cwd });
  return parseNameStatus(output);
}

/**
 * Get list of unstaged files
 */
export function getUnstagedFiles(cwd: string): FileChange[] {
  const output = git(['diff', '--name-status', '--no-renames'], { cwd });
  return parseNameStatus(output);
}

/**
 * Get list of untracked files
 */
export function getUntrackedFiles(cwd: string): FileChange[] {
  const output = git(['ls-files', '--others', '--exclude-standard'], { cwd });
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((path) => ({
      path,
      status: 'untracked' as FileStatus,
      additions: 0,
      deletions: 0,
      binary: false,
    }));
}

/**
 * Parse git diff --name-status output
 */
function parseNameStatus(output: string): FileChange[] {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [statusCode, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t');

      let status: FileStatus;
      switch (statusCode[0]) {
        case 'A':
          status = 'added';
          break;
        case 'D':
          status = 'deleted';
          break;
        case 'M':
          status = 'modified';
          break;
        case 'R':
          status = 'renamed';
          break;
        case 'C':
          status = 'copied';
          break;
        default:
          status = 'modified';
      }

      return {
        path,
        status,
        additions: 0,
        deletions: 0,
        binary: false,
      };
    });
}

/**
 * Get diff statistics for files
 */
function getDiffStats(cwd: string, diffArgs: string[]): Map<string, { additions: number; deletions: number; binary: boolean }> {
  const output = git(['diff', '--numstat', ...diffArgs], { cwd });
  const stats = new Map<string, { additions: number; deletions: number; binary: boolean }>();

  for (const line of output.trim().split('\n').filter(Boolean)) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const [add, del, path] = parts;
      const binary = add === '-' && del === '-';
      stats.set(path, {
        additions: binary ? 0 : parseInt(add, 10) || 0,
        deletions: binary ? 0 : parseInt(del, 10) || 0,
        binary,
      });
    }
  }

  return stats;
}

// =============================================================================
// Diff Parsing
// =============================================================================

/**
 * Parse unified diff into hunks
 */
function parseHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/gm;

  let match;
  let lastIndex = 0;

  while ((match = hunkRegex.exec(diff)) !== null) {
    if (hunks.length > 0) {
      // Set content of previous hunk
      hunks[hunks.length - 1].content = diff.substring(lastIndex, match.index);
    }

    hunks.push({
      oldStart: parseInt(match[1], 10),
      oldLines: parseInt(match[2] ?? '1', 10),
      newStart: parseInt(match[3], 10),
      newLines: parseInt(match[4] ?? '1', 10),
      content: '',
    });

    lastIndex = match.index;
  }

  // Set content of last hunk
  if (hunks.length > 0) {
    hunks[hunks.length - 1].content = diff.substring(lastIndex);
  }

  return hunks;
}

/**
 * Parse combined diff output into individual file diffs
 */
function parseFileDiffs(combinedDiff: string, files: FileChange[]): FileDiff[] {
  const fileDiffs: FileDiff[] = [];
  const diffPattern = /^diff --git a\/(.+?) b\/(.+?)$/gm;

  let match;
  const diffStarts: { path: string; index: number }[] = [];

  while ((match = diffPattern.exec(combinedDiff)) !== null) {
    diffStarts.push({ path: match[2], index: match.index });
  }

  for (let i = 0; i < diffStarts.length; i++) {
    const start = diffStarts[i];
    const end = diffStarts[i + 1]?.index ?? combinedDiff.length;
    const diffContent = combinedDiff.substring(start.index, end);

    const fileInfo = files.find((f) => f.path === start.path);

    fileDiffs.push({
      path: start.path,
      originalPath: fileInfo?.originalPath,
      status: fileInfo?.status ?? 'modified',
      diff: diffContent,
      additions: fileInfo?.additions ?? 0,
      deletions: fileInfo?.deletions ?? 0,
      binary: fileInfo?.binary ?? false,
      hunks: parseHunks(diffContent),
    });
  }

  return fileDiffs;
}

// =============================================================================
// Main Change Reader
// =============================================================================

/**
 * Read staged changes (index vs HEAD)
 */
export async function readStagedChanges(options: ChangeReaderOptions = {}): Promise<LocalChanges> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const contextLines = options.contextLines ?? 3;

  const files = getStagedFiles(repoRoot);
  const stats = getDiffStats(repoRoot, ['--cached']);

  // Merge stats into files
  for (const file of files) {
    const stat = stats.get(file.path);
    if (stat) {
      file.additions = stat.additions;
      file.deletions = stat.deletions;
      file.binary = stat.binary;
    }
  }

  const combinedDiff = files.length > 0
    ? git(['diff', '--cached', `-U${contextLines}`], { cwd: repoRoot })
    : '';

  return {
    type: 'staged',
    repoRoot,
    branch: getCurrentBranch(repoRoot),
    headCommit: getHeadCommit(repoRoot),
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
    combinedDiff,
    fileDiffs: parseFileDiffs(combinedDiff, files),
    analyzedAt: new Date(),
  };
}

/**
 * Read unstaged changes (working tree vs index)
 */
export async function readUnstagedChanges(options: ChangeReaderOptions = {}): Promise<LocalChanges> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const contextLines = options.contextLines ?? 3;

  let files = getUnstagedFiles(repoRoot);

  if (options.includeUntracked) {
    const untracked = getUntrackedFiles(repoRoot);
    files = [...files, ...untracked];
  }

  const stats = getDiffStats(repoRoot, []);

  for (const file of files) {
    const stat = stats.get(file.path);
    if (stat) {
      file.additions = stat.additions;
      file.deletions = stat.deletions;
      file.binary = stat.binary;
    }
  }

  const combinedDiff = files.length > 0
    ? git(['diff', `-U${contextLines}`], { cwd: repoRoot })
    : '';

  return {
    type: 'unstaged',
    repoRoot,
    branch: getCurrentBranch(repoRoot),
    headCommit: getHeadCommit(repoRoot),
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
    combinedDiff,
    fileDiffs: parseFileDiffs(combinedDiff, files),
    analyzedAt: new Date(),
  };
}

/**
 * Read all uncommitted changes (working tree vs HEAD)
 */
export async function readAllChanges(options: ChangeReaderOptions = {}): Promise<LocalChanges> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const contextLines = options.contextLines ?? 3;

  // Get all changes vs HEAD
  const output = git(['diff', 'HEAD', '--name-status', '--no-renames'], { cwd: repoRoot });
  let files = parseNameStatus(output);

  if (options.includeUntracked) {
    const untracked = getUntrackedFiles(repoRoot);
    files = [...files, ...untracked];
  }

  const stats = getDiffStats(repoRoot, ['HEAD']);

  for (const file of files) {
    const stat = stats.get(file.path);
    if (stat) {
      file.additions = stat.additions;
      file.deletions = stat.deletions;
      file.binary = stat.binary;
    }
  }

  const combinedDiff = files.length > 0
    ? git(['diff', 'HEAD', `-U${contextLines}`], { cwd: repoRoot })
    : '';

  return {
    type: 'all',
    repoRoot,
    branch: getCurrentBranch(repoRoot),
    headCommit: getHeadCommit(repoRoot),
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
    combinedDiff,
    fileDiffs: parseFileDiffs(combinedDiff, files),
    analyzedAt: new Date(),
  };
}

/**
 * Read changes from a specific commit or ref
 */
export async function readCommitChanges(
  ref: string,
  options: ChangeReaderOptions = {}
): Promise<LocalChanges> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const contextLines = options.contextLines ?? 3;

  if (!refExists(repoRoot, ref)) {
    throw new Error(`Reference not found: ${ref}`);
  }

  // Get changes: ref..HEAD
  const output = git(['diff', ref, '--name-status', '--no-renames'], { cwd: repoRoot });
  const files = parseNameStatus(output);
  const stats = getDiffStats(repoRoot, [ref]);

  for (const file of files) {
    const stat = stats.get(file.path);
    if (stat) {
      file.additions = stat.additions;
      file.deletions = stat.deletions;
      file.binary = stat.binary;
    }
  }

  const combinedDiff = files.length > 0
    ? git(['diff', ref, `-U${contextLines}`], { cwd: repoRoot })
    : '';

  return {
    type: 'commit',
    ref,
    repoRoot,
    branch: getCurrentBranch(repoRoot),
    headCommit: getHeadCommit(repoRoot),
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
    combinedDiff,
    fileDiffs: parseFileDiffs(combinedDiff, files),
    analyzedAt: new Date(),
  };
}

/**
 * Read changes between two refs
 */
export async function readRangeChanges(
  startRef: string,
  endRef: string = 'HEAD',
  options: ChangeReaderOptions = {}
): Promise<LocalChanges> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  const contextLines = options.contextLines ?? 3;

  if (!refExists(repoRoot, startRef)) {
    throw new Error(`Start reference not found: ${startRef}`);
  }
  if (!refExists(repoRoot, endRef)) {
    throw new Error(`End reference not found: ${endRef}`);
  }

  const range = `${startRef}..${endRef}`;
  const output = git(['diff', range, '--name-status', '--no-renames'], { cwd: repoRoot });
  const files = parseNameStatus(output);
  const stats = getDiffStats(repoRoot, [range]);

  for (const file of files) {
    const stat = stats.get(file.path);
    if (stat) {
      file.additions = stat.additions;
      file.deletions = stat.deletions;
      file.binary = stat.binary;
    }
  }

  const combinedDiff = files.length > 0
    ? git(['diff', range, `-U${contextLines}`], { cwd: repoRoot })
    : '';

  return {
    type: 'range',
    ref: startRef,
    endRef,
    repoRoot,
    branch: getCurrentBranch(repoRoot),
    headCommit: getHeadCommit(repoRoot),
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
    combinedDiff,
    fileDiffs: parseFileDiffs(combinedDiff, files),
    analyzedAt: new Date(),
  };
}

/**
 * Unified interface for reading changes based on options
 */
export async function readChanges(options: {
  type?: ChangeType;
  ref?: string;
  endRef?: string;
  cwd?: string;
  includeUntracked?: boolean;
  contextLines?: number;
} = {}): Promise<LocalChanges> {
  const type = options.type ?? 'staged';

  switch (type) {
    case 'staged':
      return readStagedChanges(options);
    case 'unstaged':
      return readUnstagedChanges(options);
    case 'all':
      return readAllChanges(options);
    case 'commit':
      if (!options.ref) {
        throw new Error('ref is required for commit type');
      }
      return readCommitChanges(options.ref, options);
    case 'range':
      if (!options.ref) {
        throw new Error('ref is required for range type');
      }
      return readRangeChanges(options.ref, options.endRef, options);
    default:
      throw new Error(`Unknown change type: ${type}`);
  }
}

/**
 * Quick summary of local changes (no diff content)
 */
export function getChangeSummary(cwd: string = process.cwd()): {
  staged: number;
  unstaged: number;
  untracked: number;
  branch: string;
  hasChanges: boolean;
} {
  const repoRoot = findRepoRoot(cwd);
  const staged = getStagedFiles(repoRoot).length;
  const unstaged = getUnstagedFiles(repoRoot).length;
  const untracked = getUntrackedFiles(repoRoot).length;
  const branch = getCurrentBranch(repoRoot);

  return {
    staged,
    unstaged,
    untracked,
    branch,
    hasChanges: staged > 0 || unstaged > 0 || untracked > 0,
  };
}
