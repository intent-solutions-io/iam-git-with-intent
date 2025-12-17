/**
 * 3-Way Merge Core for Git With Intent
 *
 * Phase 20: Deterministic merge-conflict resolution with diff3-style algorithm.
 *
 * This module provides:
 * - Line-based 3-way merge (base, ours, theirs)
 * - Deterministic output (same input → same bytes)
 * - Conflict detection with precise markers
 * - Binary file detection and skip
 *
 * Contract:
 * - status: 'clean' | 'conflict' | 'skipped'
 * - mergedText: The merged content (with conflict markers if status='conflict')
 * - conflicts: Array of conflict regions
 * - reason?: Skip reason if status='skipped'
 *
 * @module @gwi/core/merge
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Single conflict region
 */
export interface ConflictRegion {
  /** Starting line number in merged output (0-indexed) */
  startLine: number;
  /** Ending line number in merged output (0-indexed) */
  endLine: number;
  /** Content from ours */
  oursContent: string;
  /** Content from theirs */
  theirsContent: string;
  /** Content from base (for context) */
  baseContent: string;
}

/**
 * Merge result
 */
export interface Merge3Result {
  /** Merge status */
  status: 'clean' | 'conflict' | 'skipped';
  /** Merged text (may contain conflict markers if status='conflict') */
  mergedText: string;
  /** Array of conflict regions (empty if clean) */
  conflicts: ConflictRegion[];
  /** Skip reason if status='skipped' */
  reason?: string;
}

/**
 * Merge input
 */
export interface Merge3Input {
  /** Common ancestor content */
  base: string;
  /** HEAD branch content */
  ours: string;
  /** Incoming branch content */
  theirs: string;
  /** Optional labels for conflict markers */
  labels?: {
    ours?: string;
    theirs?: string;
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Split text into lines
 */
function splitLines(text: string): string[] {
  if (text === '') return [];
  return text.split('\n');
}

/**
 * Join lines back to text
 */
function joinLines(lines: string[]): string {
  return lines.join('\n');
}

/**
 * Check if content appears to be binary
 */
export function isBinaryContent(content: string): boolean {
  if (content.includes('\0')) return true;

  let nonPrintable = 0;
  const checkLength = Math.min(content.length, 8000);

  for (let i = 0; i < checkLength; i++) {
    const code = content.charCodeAt(i);
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      nonPrintable++;
    }
  }

  return checkLength > 0 && nonPrintable / checkLength > 0.3;
}

// =============================================================================
// Diff Algorithm (Simple LCS-based)
// =============================================================================

/**
 * Compute the Longest Common Subsequence indices
 * Returns array of indices in 'a' that form the LCS with 'b'
 */
function lcs(a: string[], b: string[]): number[] {
  const m = a.length;
  const n = b.length;

  // Build DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS indices
  const result: number[] = [];
  let i = m, j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * A diff chunk representing a region of change
 */
interface DiffChunk {
  /** Base line range [start, end) */
  baseRange: [number, number];
  /** New line range [start, end) */
  newRange: [number, number];
}

/**
 * Compute diff between base and new as an array of changed chunks
 * Each chunk represents a region where base differs from new
 */
function computeChanges(base: string[], modified: string[]): DiffChunk[] {
  const common = lcs(base, modified);
  const chunks: DiffChunk[] = [];

  let baseIdx = 0;
  let modIdx = 0;
  let lcsIdx = 0;

  while (baseIdx < base.length || modIdx < modified.length) {
    // Find next common line
    const nextCommonBase = lcsIdx < common.length ? common[lcsIdx] : base.length;

    // Find the corresponding position in modified
    let nextCommonMod = modified.length;
    if (lcsIdx < common.length) {
      const targetLine = base[nextCommonBase];
      for (let mi = modIdx; mi < modified.length; mi++) {
        if (modified[mi] === targetLine) {
          nextCommonMod = mi;
          break;
        }
      }
    }

    // If there's a gap, record it as a changed chunk
    if (baseIdx < nextCommonBase || modIdx < nextCommonMod) {
      chunks.push({
        baseRange: [baseIdx, nextCommonBase],
        newRange: [modIdx, nextCommonMod],
      });
    }

    // Skip past the common section
    if (lcsIdx < common.length) {
      baseIdx = nextCommonBase + 1;
      modIdx = nextCommonMod + 1;
      lcsIdx++;
    } else {
      break;
    }
  }

  // Handle any trailing content
  if (baseIdx < base.length || modIdx < modified.length) {
    chunks.push({
      baseRange: [baseIdx, base.length],
      newRange: [modIdx, modified.length],
    });
  }

  return chunks;
}

// =============================================================================
// 3-Way Merge Core
// =============================================================================

/**
 * Perform a deterministic 3-way merge
 *
 * @param input - Base, ours, and theirs content
 * @returns Merge result with status, merged text, and conflicts
 */
export function merge3(input: Merge3Input): Merge3Result {
  const { base, ours, theirs, labels } = input;
  const oursLabel = labels?.ours ?? 'ours';
  const theirsLabel = labels?.theirs ?? 'theirs';

  // Check for binary content
  if (isBinaryContent(base) || isBinaryContent(ours) || isBinaryContent(theirs)) {
    return {
      status: 'skipped',
      mergedText: '',
      conflicts: [],
      reason: 'binary',
    };
  }

  // Fast path: if all three are identical
  if (base === ours && ours === theirs) {
    return { status: 'clean', mergedText: base, conflicts: [] };
  }

  // Fast path: if ours === base, take theirs (only theirs changed)
  if (base === ours) {
    return { status: 'clean', mergedText: theirs, conflicts: [] };
  }

  // Fast path: if theirs === base, take ours (only ours changed)
  if (base === theirs) {
    return { status: 'clean', mergedText: ours, conflicts: [] };
  }

  // Fast path: if ours === theirs (both made same change)
  if (ours === theirs) {
    return { status: 'clean', mergedText: ours, conflicts: [] };
  }

  // Split into lines
  const baseLines = splitLines(base);
  const oursLines = splitLines(ours);
  const theirsLines = splitLines(theirs);

  // Compute what each side changed relative to base
  const oursChanges = computeChanges(baseLines, oursLines);
  const theirsChanges = computeChanges(baseLines, theirsLines);

  // Build merged output
  const outputLines: string[] = [];
  const conflicts: ConflictRegion[] = [];

  let baseIdx = 0;
  let oursChunkIdx = 0;
  let theirsChunkIdx = 0;

  while (baseIdx <= baseLines.length) {
    // Find which changes apply at current base position
    const oursChunk = oursChunkIdx < oursChanges.length ? oursChanges[oursChunkIdx] : null;
    const theirsChunk = theirsChunkIdx < theirsChanges.length ? theirsChanges[theirsChunkIdx] : null;

    // Check if we're at a change boundary
    const atOursChange = oursChunk && oursChunk.baseRange[0] === baseIdx;
    const atTheirsChange = theirsChunk && theirsChunk.baseRange[0] === baseIdx;

    if (!atOursChange && !atTheirsChange) {
      // No change at this position - copy base line
      if (baseIdx < baseLines.length) {
        outputLines.push(baseLines[baseIdx]);
        baseIdx++;
      } else {
        break;
      }
    } else if (atOursChange && !atTheirsChange) {
      // Only ours changed - apply ours
      const newContent = oursLines.slice(oursChunk!.newRange[0], oursChunk!.newRange[1]);
      outputLines.push(...newContent);
      baseIdx = oursChunk!.baseRange[1];
      oursChunkIdx++;
    } else if (!atOursChange && atTheirsChange) {
      // Only theirs changed - apply theirs
      const newContent = theirsLines.slice(theirsChunk!.newRange[0], theirsChunk!.newRange[1]);
      outputLines.push(...newContent);
      baseIdx = theirsChunk!.baseRange[1];
      theirsChunkIdx++;
    } else {
      // Both changed - check for overlap/conflict
      const oursBaseStart = oursChunk!.baseRange[0];
      const oursBaseEnd = oursChunk!.baseRange[1];
      const theirsBaseStart = theirsChunk!.baseRange[0];
      const theirsBaseEnd = theirsChunk!.baseRange[1];

      // Check if regions overlap
      const overlap = !(oursBaseEnd <= theirsBaseStart || theirsBaseEnd <= oursBaseStart);

      if (overlap) {
        // Overlapping changes - check if they made the same change
        const oursContent = oursLines.slice(oursChunk!.newRange[0], oursChunk!.newRange[1]);
        const theirsContent = theirsLines.slice(theirsChunk!.newRange[0], theirsChunk!.newRange[1]);

        if (oursContent.join('\n') === theirsContent.join('\n')) {
          // Same change - no conflict
          outputLines.push(...oursContent);
        } else {
          // True conflict
          const conflictStart = outputLines.length;
          const baseContent = baseLines.slice(
            Math.min(oursBaseStart, theirsBaseStart),
            Math.max(oursBaseEnd, theirsBaseEnd)
          );

          outputLines.push(`<<<<<<< ${oursLabel}`);
          outputLines.push(...oursContent);
          outputLines.push('=======');
          outputLines.push(...theirsContent);
          outputLines.push(`>>>>>>> ${theirsLabel}`);

          conflicts.push({
            startLine: conflictStart,
            endLine: outputLines.length - 1,
            oursContent: oursContent.join('\n'),
            theirsContent: theirsContent.join('\n'),
            baseContent: baseContent.join('\n'),
          });
        }

        // Advance past both changes
        baseIdx = Math.max(oursBaseEnd, theirsBaseEnd);
        oursChunkIdx++;
        theirsChunkIdx++;
      } else {
        // Non-overlapping - apply the one that starts first
        if (oursBaseStart < theirsBaseStart) {
          const newContent = oursLines.slice(oursChunk!.newRange[0], oursChunk!.newRange[1]);
          outputLines.push(...newContent);
          baseIdx = oursBaseEnd;
          oursChunkIdx++;
        } else {
          const newContent = theirsLines.slice(theirsChunk!.newRange[0], theirsChunk!.newRange[1]);
          outputLines.push(...newContent);
          baseIdx = theirsBaseEnd;
          theirsChunkIdx++;
        }
      }
    }
  }

  return {
    status: conflicts.length > 0 ? 'conflict' : 'clean',
    mergedText: joinLines(outputLines),
    conflicts,
  };
}

// =============================================================================
// Exports
// =============================================================================

export { loadFixture, loadAllFixtures, loadFixturesByCategory, loadFixturesByStatus } from './__fixtures__/index.js';
export type { MergeFixture, FixtureMeta, FixtureName } from './__fixtures__/index.js';
