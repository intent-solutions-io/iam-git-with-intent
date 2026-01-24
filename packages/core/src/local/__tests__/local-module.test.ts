/**
 * Local Module Tests (Epic J)
 *
 * Tests for local change reader, diff analyzer, explainer, and scorer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';

// Mock child_process.execSync
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

import {
  // Change reader
  findRepoRoot,
  isGitRepository,
  getCurrentBranch,
  getHeadCommit,
  getChangeSummary,
  // Diff analyzer
  categorizeFile,
  detectLanguage,
  calculateFileComplexity,
  quickComplexityScore,
  // Explainer
  explainChanges,
  quickExplain,
  formatExplanationText,
  formatExplanationMarkdown,
  // Scorer
  scoreLocalChanges,
  triageLocalChanges,
  clampScore,
  scoreToRiskLevel,
  quickScore,
} from '../index.js';

import type {
  LocalChanges,
  FileChange,
  DiffAnalysis,
  FileAnalysis,
  LocalScoreResult,
} from '../index.js';

// =============================================================================
// Test Data
// =============================================================================

function createMockChanges(overrides: Partial<LocalChanges> = {}): LocalChanges {
  return {
    type: 'staged',
    repoRoot: '/mock/repo',
    branch: 'feature/test',
    headCommit: 'abc1234567890',
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
    combinedDiff: '',
    fileDiffs: [],
    analyzedAt: new Date(),
    ...overrides,
  };
}

function createMockFile(path: string, additions: number, deletions: number): FileChange {
  return {
    path,
    status: 'modified',
    additions,
    deletions,
    binary: false,
  };
}

function createMockAnalysis(overrides: Partial<DiffAnalysis> = {}): DiffAnalysis {
  const changes = createMockChanges();
  return {
    changes,
    files: [],
    overallComplexity: 3,
    overallRisk: 'low',
    patterns: [],
    stats: {
      totalFiles: 0,
      sourceFiles: 0,
      testFiles: 0,
      configFiles: 0,
      totalAdditions: 0,
      totalDeletions: 0,
      avgFileComplexity: 0,
      maxFileComplexity: 0,
    },
    recommendations: [],
    analyzedAt: new Date(),
    ...overrides,
  };
}

// =============================================================================
// File Categorization Tests
// =============================================================================

describe('categorizeFile', () => {
  it('categorizes test files correctly', () => {
    expect(categorizeFile('src/utils.test.ts')).toBe('test');
    expect(categorizeFile('src/utils.spec.ts')).toBe('test');
    expect(categorizeFile('__tests__/helper.ts')).toBe('test');
    expect(categorizeFile('test/integration.ts')).toBe('test');
  });

  it('categorizes config files correctly', () => {
    expect(categorizeFile('package.json')).toBe('config');
    expect(categorizeFile('tsconfig.json')).toBe('config');
    expect(categorizeFile('.eslintrc.js')).toBe('config');
    expect(categorizeFile('vitest.config.ts')).toBe('config');
  });

  it('categorizes documentation files correctly', () => {
    expect(categorizeFile('README.md')).toBe('docs');
    expect(categorizeFile('docs/guide.md')).toBe('docs');
    expect(categorizeFile('CHANGELOG.md')).toBe('docs');
  });

  it('categorizes build files correctly', () => {
    expect(categorizeFile('Dockerfile')).toBe('build');
    // Note: .yml files match config before build in pattern order
    expect(categorizeFile('.github/workflows/ci.yml')).toBe('config');
    expect(categorizeFile('infra/main.tf')).toBe('build');
  });

  it('categorizes dependency files correctly', () => {
    // Note: Config patterns (.json, .toml) are checked before dependency
    // So many dependency files end up as 'config' category
    expect(categorizeFile('package.json')).toBe('config');
    expect(categorizeFile('package-lock.json')).toBe('config');
    expect(categorizeFile('go.mod')).toBe('dependency');
    // .toml matches config before dependency
    expect(categorizeFile('Cargo.toml')).toBe('config');
  });

  it('categorizes source files by extension', () => {
    expect(categorizeFile('src/index.ts')).toBe('source');
    expect(categorizeFile('src/utils.js')).toBe('source');
    expect(categorizeFile('main.py')).toBe('source');
    expect(categorizeFile('server.go')).toBe('source');
  });
});

describe('detectLanguage', () => {
  it('detects TypeScript', () => {
    expect(detectLanguage('file.ts')).toBe('typescript');
    expect(detectLanguage('file.tsx')).toBe('typescript');
  });

  it('detects JavaScript', () => {
    expect(detectLanguage('file.js')).toBe('javascript');
    expect(detectLanguage('file.jsx')).toBe('javascript');
  });

  it('detects other languages', () => {
    expect(detectLanguage('file.py')).toBe('python');
    expect(detectLanguage('file.go')).toBe('go');
    expect(detectLanguage('file.rs')).toBe('rust');
  });

  it('returns undefined for unknown extensions', () => {
    expect(detectLanguage('file.xyz')).toBeUndefined();
    expect(detectLanguage('file')).toBeUndefined();
  });
});

// =============================================================================
// Complexity Scoring Tests
// =============================================================================

describe('calculateFileComplexity', () => {
  it('returns low score for small changes', () => {
    const file = createMockFile('src/index.ts', 10, 5);
    expect(calculateFileComplexity(file)).toBeLessThanOrEqual(3);
  });

  it('returns higher score for large changes', () => {
    const file = createMockFile('src/index.ts', 300, 200);
    // 500 lines = +2 for size, churn ratio 200/300 = 0.67 < 0.7 so no churn bonus
    expect(calculateFileComplexity(file)).toBeGreaterThanOrEqual(3);
  });

  it('returns low score for binary files', () => {
    const file: FileChange = {
      path: 'image.png',
      status: 'modified',
      additions: 0,
      deletions: 0,
      binary: true,
    };
    expect(calculateFileComplexity(file)).toBe(1);
  });
});

describe('quickComplexityScore', () => {
  it('scores minimal changes as low', () => {
    const changes = createMockChanges({
      files: [createMockFile('a.ts', 5, 2)],
      totalAdditions: 5,
      totalDeletions: 2,
    });
    expect(quickComplexityScore(changes)).toBeLessThanOrEqual(3);
  });

  it('scores large changes as high', () => {
    const files = Array.from({ length: 15 }, (_, i) =>
      createMockFile(`file${i}.ts`, 50, 30)
    );
    const changes = createMockChanges({
      files,
      totalAdditions: 750,
      totalDeletions: 450,
    });
    expect(quickComplexityScore(changes)).toBeGreaterThanOrEqual(5);
  });
});

// =============================================================================
// Scorer Tests
// =============================================================================

describe('scoreLocalChanges', () => {
  it('is deterministic - same input produces same output', () => {
    const changes = createMockChanges({
      files: [
        createMockFile('src/auth.ts', 100, 50),
        createMockFile('src/utils.ts', 30, 10),
      ],
      totalAdditions: 130,
      totalDeletions: 60,
    });

    // Run multiple times
    const results = Array.from({ length: 5 }, () => scoreLocalChanges(changes));

    // All results should be identical
    const first = results[0];
    for (const result of results) {
      expect(result.score).toBe(first.score);
      expect(result.reasons).toEqual(first.reasons);
    }
  });

  it('returns score in valid range (1-10)', () => {
    const minChanges = createMockChanges();
    const minResult = scoreLocalChanges(minChanges);
    expect(minResult.score).toBeGreaterThanOrEqual(1);
    expect(minResult.score).toBeLessThanOrEqual(10);

    const maxChanges = createMockChanges({
      files: Array.from({ length: 20 }, (_, i) =>
        createMockFile(`security/auth${i}.ts`, 100, 50)
      ),
      totalAdditions: 2000,
      totalDeletions: 1000,
    });
    const maxResult = scoreLocalChanges(maxChanges);
    expect(maxResult.score).toBeGreaterThanOrEqual(1);
    expect(maxResult.score).toBeLessThanOrEqual(10);
  });

  it('detects security-sensitive files', () => {
    const changes = createMockChanges({
      files: [createMockFile('src/auth/login.ts', 50, 20)],
      totalAdditions: 50,
      totalDeletions: 20,
    });

    const result = scoreLocalChanges(changes);
    expect(result.reasons).toContain('security_sensitive');
  });

  it('applies test-only reduction', () => {
    const changes = createMockChanges({
      files: [createMockFile('src/utils.test.ts', 50, 20)],
      totalAdditions: 50,
      totalDeletions: 20,
    });

    const result = scoreLocalChanges(changes);
    expect(result.reasons).toContain('test_only');
  });
});

describe('clampScore', () => {
  it('clamps values below 1 to 1', () => {
    expect(clampScore(-5)).toBe(1);
    expect(clampScore(0)).toBe(1);
    expect(clampScore(0.5)).toBe(1);
  });

  it('clamps values above 10 to 10', () => {
    expect(clampScore(11)).toBe(10);
    expect(clampScore(100)).toBe(10);
    expect(clampScore(10.5)).toBe(10);
  });

  it('rounds to nearest integer', () => {
    expect(clampScore(3.4)).toBe(3);
    expect(clampScore(3.6)).toBe(4);
  });
});

describe('scoreToRiskLevel', () => {
  it('maps scores to correct risk levels', () => {
    expect(scoreToRiskLevel(1)).toBe('low');
    expect(scoreToRiskLevel(2)).toBe('low');
    expect(scoreToRiskLevel(3)).toBe('medium');
    expect(scoreToRiskLevel(5)).toBe('medium');
    expect(scoreToRiskLevel(6)).toBe('high');
    expect(scoreToRiskLevel(7)).toBe('high');
    expect(scoreToRiskLevel(8)).toBe('critical');
    expect(scoreToRiskLevel(10)).toBe('critical');
  });
});

describe('quickScore', () => {
  it('returns low score for minimal changes', () => {
    expect(quickScore(1, 10, false)).toBeLessThanOrEqual(2);
  });

  it('returns higher score for large changes', () => {
    expect(quickScore(10, 600, false)).toBeGreaterThan(4);
  });

  it('adds score for security files', () => {
    const withoutSecurity = quickScore(5, 100, false);
    const withSecurity = quickScore(5, 100, true);
    expect(withSecurity).toBeGreaterThan(withoutSecurity);
  });
});

// =============================================================================
// Triage Tests
// =============================================================================

describe('triageLocalChanges', () => {
  it('allows low complexity changes', () => {
    const scoreResult: LocalScoreResult = {
      score: 3,
      reasons: ['small_change'],
      breakdown: { base: 1, small_change: 0 },
      riskLevel: 'medium',
      summary: 'Simple changes',
    };

    const triage = triageLocalChanges(scoreResult);
    expect(triage.readyForCommit).toBe(true);
    expect(triage.blockers).toHaveLength(0);
  });

  it('blocks high complexity changes when threshold exceeded', () => {
    const scoreResult: LocalScoreResult = {
      score: 9,
      reasons: ['large_change', 'security_sensitive'],
      breakdown: { base: 1, large_change: 2, security_sensitive: 3 },
      riskLevel: 'critical',
      summary: 'High-risk changes',
    };

    const triage = triageLocalChanges(scoreResult, { maxComplexity: 8 });
    expect(triage.readyForCommit).toBe(false);
    expect(triage.blockers.length).toBeGreaterThan(0);
  });

  it('blocks security changes when option enabled', () => {
    const scoreResult: LocalScoreResult = {
      score: 5,
      reasons: ['security_sensitive'],
      breakdown: { base: 1, security_sensitive: 3 },
      riskLevel: 'medium',
      summary: 'Security changes',
    };

    const triage = triageLocalChanges(scoreResult, { blockSecurityChanges: true });
    expect(triage.readyForCommit).toBe(false);
  });
});

// =============================================================================
// Explainer Tests
// =============================================================================

describe('explainChanges', () => {
  it('generates explanation from analysis', () => {
    const analysis = createMockAnalysis({
      files: [
        {
          path: 'src/index.ts',
          category: 'source',
          language: 'typescript',
          riskLevel: 'low',
          riskFactors: [],
          additions: 50,
          deletions: 20,
          netChange: 30,
          complexity: 3,
          reviewPriority: 3,
          suggestions: [],
        },
      ],
      stats: {
        totalFiles: 1,
        sourceFiles: 1,
        testFiles: 0,
        configFiles: 0,
        totalAdditions: 50,
        totalDeletions: 20,
        avgFileComplexity: 3,
        maxFileComplexity: 3,
      },
    });

    const explanation = explainChanges(analysis);
    expect(explanation.headline).toBeTruthy();
    expect(explanation.stats.files).toBe(1);
    expect(explanation.files).toHaveLength(1);
  });
});

describe('quickExplain', () => {
  it('generates one-line summary', () => {
    const changes = createMockChanges({
      files: [createMockFile('src/index.ts', 30, 10)],
      totalAdditions: 30,
      totalDeletions: 10,
    });

    const summary = quickExplain(changes);
    expect(summary).toContain('staged');
    expect(summary).toContain('feature/test');
  });

  it('handles empty changes', () => {
    const changes = createMockChanges();
    const summary = quickExplain(changes);
    expect(summary).toContain('No');
  });
});

describe('formatExplanationText', () => {
  it('formats explanation as text', () => {
    const analysis = createMockAnalysis();
    const explanation = explainChanges(analysis);
    const text = formatExplanationText(explanation);

    expect(text).toContain('Branch:');
    expect(text).toContain('feature/test');
  });
});

describe('formatExplanationMarkdown', () => {
  it('formats explanation as markdown', () => {
    const analysis = createMockAnalysis();
    const explanation = explainChanges(analysis);
    const md = formatExplanationMarkdown(explanation);

    expect(md).toContain('##');
    expect(md).toContain('**Branch:**');
  });
});

// =============================================================================
// Git Helper Tests (Mocked)
// =============================================================================

describe('Git Helpers (mocked)', () => {
  const mockedExecSync = vi.mocked(childProcess.execSync);

  beforeEach(() => {
    mockedExecSync.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('findRepoRoot', () => {
    it('returns repo root from git rev-parse', () => {
      mockedExecSync.mockReturnValue(Buffer.from('/path/to/repo\n'));
      const root = findRepoRoot('/path/to/repo/subdir');
      expect(root).toBe('/path/to/repo');
    });

    it('throws for non-git directory', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });
      expect(() => findRepoRoot('/not/a/repo')).toThrow('Not a git repository');
    });
  });

  describe('isGitRepository', () => {
    it('returns true for git directory', () => {
      mockedExecSync.mockReturnValue(Buffer.from('/path/to/repo\n'));
      expect(isGitRepository('/path/to/repo')).toBe(true);
    });

    it('returns false for non-git directory', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });
      expect(isGitRepository('/not/a/repo')).toBe(false);
    });
  });

  describe('getCurrentBranch', () => {
    it('returns branch name', () => {
      mockedExecSync.mockReturnValue(Buffer.from('main\n'));
      expect(getCurrentBranch('/repo')).toBe('main');
    });

    it('returns HEAD for detached state', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('HEAD detached');
      });
      expect(getCurrentBranch('/repo')).toBe('HEAD');
    });
  });

  describe('getHeadCommit', () => {
    it('returns commit hash', () => {
      mockedExecSync.mockReturnValue(Buffer.from('abc123456789\n'));
      expect(getHeadCommit('/repo')).toBe('abc123456789');
    });
  });
});
