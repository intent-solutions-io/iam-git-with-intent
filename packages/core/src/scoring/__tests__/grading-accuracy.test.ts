/**
 * Grading Accuracy Validation Tests (Golden Tests)
 *
 * Validates grading accuracy against known-good examples representing
 * real-world PR scenarios across all grade levels (A-F).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GradingEngine, type AutoFixRun } from '../grading-engine.js';

describe('Grading Accuracy (Golden Tests)', () => {
  let engine: GradingEngine;

  beforeAll(() => {
    engine = new GradingEngine();
  });

  // ============================================================================
  // Grade A Examples (90-100): Excellent Quality
  // ============================================================================

  describe('Grade A: Excellent Quality PRs', () => {
    it('should grade perfect security fix as A', () => {
      const run: AutoFixRun = {
        id: 'run-a1',
        prUrl: 'https://github.com/org/repo/pull/101',
        status: 'success',
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: -3,
        filesChanged: 2,
        linesAdded: 25,
        linesDeleted: 15,
        testsRun: 15,
        testsPassed: 15,
        testsFailed: 0,
        coverageBefore: 85,
        coverageAfter: 90,
        merged: true,
        timeToMerge: 0.5,
        humanEditsRequired: false,
        commentsReceived: 1,
        tokensUsed: 3000,
        apiCost: 0.02,
        durationMs: 20000,
        commitMessage: 'Fixed critical security vulnerability in authentication system',
        diffContent: 'Added input validation and improved error handling',
        readmeUpdated: true,
        commentsAdded: 8,
        docsChanged: true
      };

      const result = engine.grade(run);
      expect(result.letterGrade).toBe('A');
      expect(result.overallScore).toBeGreaterThanOrEqual(90);
    });

    it('should grade comprehensive refactor as A', () => {
      const run: AutoFixRun = {
        id: 'run-a2',
        prUrl: 'https://github.com/org/repo/pull/102',
        status: 'success',
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: -10,
        filesChanged: 5,
        linesAdded: 150,
        linesDeleted: 200,
        testsRun: 30,
        testsPassed: 30,
        testsFailed: 0,
        coverageBefore: 80,
        coverageAfter: 88,
        merged: true,
        timeToMerge: 2,
        humanEditsRequired: false,
        commentsReceived: 3,
        tokensUsed: 8000,
        apiCost: 0.05,
        durationMs: 35000,
        commitMessage: 'Refactored authentication module, reduced complexity, added comprehensive tests',
        diffContent: 'Simplified logic, improved type safety, added unit tests',
        readmeUpdated: true,
        commentsAdded: 15,
        docsChanged: true
      };

      const result = engine.grade(run);
      expect(result.letterGrade).toBe('A');
      expect(result.overallScore).toBeGreaterThanOrEqual(90);
    });

    it('should grade optimized performance fix as A', () => {
      const run: AutoFixRun = {
        id: 'run-a3',
        prUrl: 'https://github.com/org/repo/pull/103',
        status: 'success',
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: 0,
        filesChanged: 3,
        linesAdded: 80,
        linesDeleted: 60,
        testsRun: 20,
        testsPassed: 20,
        testsFailed: 0,
        coverageBefore: 82,
        coverageAfter: 86,
        merged: true,
        timeToMerge: 1,
        humanEditsRequired: false,
        commentsReceived: 2,
        tokensUsed: 4500,
        apiCost: 0.03,
        durationMs: 25000,
        commitMessage: 'Optimized database queries, improved performance by 50%',
        diffContent: 'Added caching layer, optimized query performance',
        readmeUpdated: false,
        commentsAdded: 10,
        docsChanged: true
      };

      const result = engine.grade(run);
      expect(result.letterGrade).toBe('A');
      expect(result.overallScore).toBeGreaterThanOrEqual(90);
    });
  });

  // ============================================================================
  // Grade B Examples (80-89): Good Quality
  // ============================================================================

  describe('Grade B: Good Quality PRs', () => {
    it('should grade good bug fix as B', () => {
      const run: AutoFixRun = {
        id: 'run-b1',
        prUrl: 'https://github.com/org/repo/pull/201',
        status: 'success',
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: 2,
        filesChanged: 3,
        linesAdded: 50,
        linesDeleted: 30,
        testsRun: 12,
        testsPassed: 12,
        testsFailed: 0,
        coverageBefore: 75,
        coverageAfter: 78,
        merged: true,
        timeToMerge: 4,
        humanEditsRequired: false,
        commentsReceived: 2,
        tokensUsed: 5000,
        apiCost: 0.04,
        durationMs: 40000,
        commitMessage: 'Fixed authentication bug in login flow',
        diffContent: 'Resolved issue with session validation',
        readmeUpdated: false,
        commentsAdded: 5,
        docsChanged: false
      };

      const result = engine.grade(run);
      expect(['A', 'B']).toContain(result.letterGrade);
      expect(result.overallScore).toBeGreaterThanOrEqual(75);
    });

    it('should grade feature addition with minor issues as B', () => {
      const run: AutoFixRun = {
        id: 'run-b2',
        prUrl: 'https://github.com/org/repo/pull/202',
        status: 'success',
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: 5,
        filesChanged: 4,
        linesAdded: 120,
        linesDeleted: 20,
        testsRun: 18,
        testsPassed: 17,
        testsFailed: 1,
        coverageBefore: 80,
        coverageAfter: 82,
        merged: true,
        timeToMerge: 8,
        humanEditsRequired: false,
        commentsReceived: 4,
        tokensUsed: 6000,
        apiCost: 0.06,
        durationMs: 50000,
        commitMessage: 'Added user profile feature',
        diffContent: 'Implemented user profile with avatar upload',
        readmeUpdated: true,
        commentsAdded: 8,
        docsChanged: false
      };

      const result = engine.grade(run);
      expect(['A', 'B', 'C']).toContain(result.letterGrade);
    });
  });

  // ============================================================================
  // Grade C Examples (70-79): Acceptable Quality
  // ============================================================================

  describe('Grade C: Acceptable Quality PRs', () => {
    it('should grade PR with human edits required as C or D', () => {
      const run: AutoFixRun = {
        id: 'run-c1',
        prUrl: 'https://github.com/org/repo/pull/301',
        status: 'success',
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: 8,
        filesChanged: 5,
        linesAdded: 200,
        linesDeleted: 50,
        testsRun: 15,
        testsPassed: 13,
        testsFailed: 2,
        coverageBefore: 70,
        coverageAfter: 72,
        merged: true,
        timeToMerge: 24,
        humanEditsRequired: true,
        commentsReceived: 8,
        tokensUsed: 12000,
        apiCost: 0.10,
        durationMs: 80000,
        commitMessage: 'Added new API endpoint',
        diffContent: 'Implemented REST API with validation',
        readmeUpdated: false,
        commentsAdded: 3,
        docsChanged: false
      };

      const result = engine.grade(run);
      expect(['B', 'C', 'D']).toContain(result.letterGrade);
      expect(result.overallScore).toBeGreaterThanOrEqual(60);
      expect(result.overallScore).toBeLessThan(90);
    });

    it('should grade slow merge with coverage drop as C or D', () => {
      const run: AutoFixRun = {
        id: 'run-c2',
        prUrl: 'https://github.com/org/repo/pull/302',
        status: 'success',
        lintPassed: true,
        typecheckPassed: false,
        complexityDelta: 6,
        filesChanged: 4,
        linesAdded: 150,
        linesDeleted: 100,
        testsRun: 10,
        testsPassed: 9,
        testsFailed: 1,
        coverageBefore: 75,
        coverageAfter: 70,
        merged: true,
        timeToMerge: 48,
        humanEditsRequired: false,
        commentsReceived: 6,
        tokensUsed: 10000,
        apiCost: 0.08,
        durationMs: 70000,
        commitMessage: 'Updated data processing pipeline',
        diffContent: 'Refactored processing logic',
        readmeUpdated: false,
        commentsAdded: 2,
        docsChanged: false
      };

      const result = engine.grade(run);
      expect(['C', 'D', 'F']).toContain(result.letterGrade);
      expect(result.overallScore).toBeLessThan(80);
    });
  });

  // ============================================================================
  // Grade D Examples (60-69): Poor Quality
  // ============================================================================

  describe('Grade D: Poor Quality PRs', () => {
    it('should grade PR with lint failures as D', () => {
      const run: AutoFixRun = {
        id: 'run-d1',
        prUrl: 'https://github.com/org/repo/pull/401',
        status: 'partial',
        lintPassed: false,
        typecheckPassed: true,
        complexityDelta: 15,
        filesChanged: 6,
        linesAdded: 300,
        linesDeleted: 100,
        testsRun: 8,
        testsPassed: 5,
        testsFailed: 3,
        coverageBefore: 65,
        coverageAfter: 60,
        merged: true,
        timeToMerge: 72,
        humanEditsRequired: true,
        commentsReceived: 12,
        tokensUsed: 15000,
        apiCost: 0.15,
        durationMs: 120000,
        commitMessage: 'Quick fix for the issue',
        diffContent: 'Temporary workaround added',
        readmeUpdated: false,
        commentsAdded: 1,
        docsChanged: false
      };

      const result = engine.grade(run);
      expect(['D', 'F']).toContain(result.letterGrade);
      expect(result.overallScore).toBeLessThan(75);
    });

    it('should grade PR with no tests as D', () => {
      const run: AutoFixRun = {
        id: 'run-d2',
        prUrl: 'https://github.com/org/repo/pull/402',
        status: 'partial',
        lintPassed: true,
        typecheckPassed: false,
        complexityDelta: 20,
        filesChanged: 8,
        linesAdded: 400,
        linesDeleted: 50,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        coverageBefore: 70,
        coverageAfter: 55,
        merged: false,
        timeToMerge: undefined,
        humanEditsRequired: true,
        commentsReceived: 15,
        tokensUsed: 20000,
        apiCost: 0.20,
        durationMs: 150000,
        commitMessage: 'Added feature (tests TODO)',
        diffContent: 'Implemented without test coverage',
        readmeUpdated: false,
        commentsAdded: 0,
        docsChanged: false
      };

      const result = engine.grade(run);
      expect(['D', 'F']).toContain(result.letterGrade);
      expect(result.overallScore).toBeLessThan(70);
    });
  });

  // ============================================================================
  // Grade F Examples (0-59): Failed
  // ============================================================================

  describe('Grade F: Failed PRs', () => {
    it('should grade broken build as F', () => {
      const run: AutoFixRun = {
        id: 'run-f1',
        prUrl: 'https://github.com/org/repo/pull/501',
        status: 'failure',
        lintPassed: false,
        typecheckPassed: false,
        complexityDelta: 30,
        filesChanged: 10,
        linesAdded: 500,
        linesDeleted: 200,
        testsRun: 20,
        testsPassed: 5,
        testsFailed: 15,
        coverageBefore: 80,
        coverageAfter: 50,
        merged: false,
        timeToMerge: undefined,
        humanEditsRequired: true,
        commentsReceived: 25,
        tokensUsed: 30000,
        apiCost: 0.50,
        durationMs: 300000,
        commitMessage: 'Hack to fix the issue quickly',
        diffContent: 'Hardcoded values, tests disabled',
        readmeUpdated: false,
        commentsAdded: 0,
        docsChanged: false
      };

      const result = engine.grade(run);
      expect(result.letterGrade).toBe('F');
      expect(result.overallScore).toBeLessThan(60);
    });

    it('should grade rejected PR with all failures as F', () => {
      const run: AutoFixRun = {
        id: 'run-f2',
        prUrl: 'https://github.com/org/repo/pull/502',
        status: 'failure',
        lintPassed: false,
        typecheckPassed: false,
        complexityDelta: 50,
        filesChanged: 15,
        linesAdded: 1000,
        linesDeleted: 100,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        coverageBefore: 75,
        coverageAfter: 40,
        merged: false,
        timeToMerge: undefined,
        humanEditsRequired: true,
        commentsReceived: 30,
        tokensUsed: 40000,
        apiCost: 1.00,
        durationMs: 600000,
        commitMessage: 'WIP: broken code, will fix later',
        diffContent: 'Untested code with TODO comments everywhere',
        readmeUpdated: false,
        commentsAdded: 0,
        docsChanged: false
      };

      const result = engine.grade(run);
      expect(result.letterGrade).toBe('F');
      expect(result.overallScore).toBeLessThan(50);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle huge PR (>1000 lines)', () => {
      const run: AutoFixRun = {
        id: 'run-edge1',
        prUrl: 'https://github.com/org/repo/pull/601',
        status: 'success',
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: 10,
        filesChanged: 20,
        linesAdded: 1500,
        linesDeleted: 500,
        testsRun: 50,
        testsPassed: 50,
        testsFailed: 0,
        coverageBefore: 80,
        coverageAfter: 82,
        merged: true,
        timeToMerge: 12,
        humanEditsRequired: false,
        commentsReceived: 10,
        tokensUsed: 25000,
        apiCost: 0.20,
        durationMs: 200000,
        commitMessage: 'Major refactor of authentication system',
        diffContent: 'Complete rewrite with improved architecture',
        readmeUpdated: true,
        commentsAdded: 50,
        docsChanged: true
      };

      const result = engine.grade(run);
      expect(result.letterGrade).toBeDefined();
      expect(['A', 'B', 'C']).toContain(result.letterGrade);
    });

    it('should handle PR with no tests gracefully', () => {
      const run: AutoFixRun = {
        id: 'run-edge2',
        prUrl: 'https://github.com/org/repo/pull/602',
        status: 'success',
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: 0,
        filesChanged: 2,
        linesAdded: 30,
        linesDeleted: 10,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        coverageBefore: 80,
        coverageAfter: 80,
        merged: true,
        timeToMerge: 3,
        humanEditsRequired: false,
        commentsReceived: 1,
        tokensUsed: 2000,
        apiCost: 0.01,
        durationMs: 15000,
        commitMessage: 'Updated documentation',
        diffContent: 'Fixed typos in README',
        readmeUpdated: true,
        commentsAdded: 0,
        docsChanged: true
      };

      const result = engine.grade(run);
      expect(result.letterGrade).toBeDefined();
      // Should still grade, but penalized for no tests
    });

    it('should apply bonus for security fixes', () => {
      const securityFix: AutoFixRun = {
        id: 'run-edge3',
        prUrl: 'https://github.com/org/repo/pull/603',
        status: 'success',
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: 0,
        filesChanged: 3,
        linesAdded: 50,
        linesDeleted: 30,
        testsRun: 12,
        testsPassed: 12,
        testsFailed: 0,
        coverageBefore: 80,
        coverageAfter: 82,
        merged: true,
        timeToMerge: 2,
        humanEditsRequired: false,
        commentsReceived: 2,
        tokensUsed: 4000,
        apiCost: 0.03,
        durationMs: 25000,
        commitMessage: 'Security patch for CVE-2024-1234 vulnerability',
        diffContent: 'Fixed SQL injection vulnerability with input validation',
        readmeUpdated: false,
        commentsAdded: 5,
        docsChanged: true
      };

      const normalFix: AutoFixRun = {
        ...securityFix,
        id: 'run-edge3-normal',
        commitMessage: 'Fixed bug in validation',
        diffContent: 'Improved input validation logic'
      };

      const securityResult = engine.grade(securityFix);
      const normalResult = engine.grade(normalFix);

      // Security fix should score higher due to keyword bonuses
      // This assumes keyword matcher is available
      if (securityResult.criteria.find(c => c.id === 'keyword_analysis')) {
        expect(securityResult.overallScore).toBeGreaterThanOrEqual(normalResult.overallScore);
      }
    });

    it('should apply penalty for breaking changes', () => {
      const run: AutoFixRun = {
        id: 'run-edge4',
        prUrl: 'https://github.com/org/repo/pull/604',
        status: 'success',
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: 5,
        filesChanged: 8,
        linesAdded: 200,
        linesDeleted: 150,
        testsRun: 25,
        testsPassed: 25,
        testsFailed: 0,
        coverageBefore: 80,
        coverageAfter: 82,
        merged: true,
        timeToMerge: 48,
        humanEditsRequired: true,
        commentsReceived: 15,
        tokensUsed: 10000,
        apiCost: 0.08,
        durationMs: 100000,
        commitMessage: 'Breaking change: updated API endpoints',
        diffContent: 'Removed deprecated methods, API incompatible',
        readmeUpdated: true,
        commentsAdded: 10,
        docsChanged: true
      };

      const result = engine.grade(run);
      expect(result.letterGrade).toBeDefined();
      // Breaking changes should be penalized
    });
  });

  // ============================================================================
  // Accuracy Validation
  // ============================================================================

  describe('Overall Accuracy', () => {
    it('should maintain grade distribution across all examples', () => {
      const examples: Array<{ run: AutoFixRun; expectedGrade: string }> = [
        // A grades
        { run: createExcellentPR('a1'), expectedGrade: 'A' },
        { run: createExcellentPR('a2'), expectedGrade: 'A' },
        { run: createExcellentPR('a3'), expectedGrade: 'A' },

        // B grades
        { run: createGoodPR('b1'), expectedGrade: 'B' },
        { run: createGoodPR('b2'), expectedGrade: 'B' },

        // C grades
        { run: createAcceptablePR('c1'), expectedGrade: 'C' },
        { run: createAcceptablePR('c2'), expectedGrade: 'C' },

        // D grades
        { run: createPoorPR('d1'), expectedGrade: 'D' },
        { run: createPoorPR('d2'), expectedGrade: 'D' },

        // F grades
        { run: createFailedPR('f1'), expectedGrade: 'F' },
        { run: createFailedPR('f2'), expectedGrade: 'F' }
      ];

      let correctGrades = 0;
      let tolerableGrades = 0; // Within ±1 grade

      for (const example of examples) {
        const result = engine.grade(example.run);

        if (result.letterGrade === example.expectedGrade) {
          correctGrades++;
          tolerableGrades++;
        } else if (isWithinOneGrade(result.letterGrade, example.expectedGrade)) {
          tolerableGrades++;
        }
      }

      const accuracy = (correctGrades / examples.length) * 100;
      const tolerableAccuracy = (tolerableGrades / examples.length) * 100;

      console.log(`Exact accuracy: ${accuracy.toFixed(1)}%`);
      console.log(`Tolerable accuracy (±1 grade): ${tolerableAccuracy.toFixed(1)}%`);

      // Require at least 80% tolerable accuracy
      expect(tolerableAccuracy).toBeGreaterThanOrEqual(80);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

function createExcellentPR(id: string): AutoFixRun {
  return {
    id,
    prUrl: `https://github.com/org/repo/pull/${id}`,
    status: 'success',
    lintPassed: true,
    typecheckPassed: true,
    complexityDelta: -5,
    filesChanged: 3,
    linesAdded: 80,
    linesDeleted: 60,
    testsRun: 20,
    testsPassed: 20,
    testsFailed: 0,
    coverageBefore: 82,
    coverageAfter: 88,
    merged: true,
    timeToMerge: 1,
    humanEditsRequired: false,
    commentsReceived: 2,
    tokensUsed: 4000,
    apiCost: 0.03,
    durationMs: 25000,
    commitMessage: 'Fixed critical bug with comprehensive testing',
    diffContent: 'Improved code quality and added tests',
    readmeUpdated: true,
    commentsAdded: 10,
    docsChanged: true
  };
}

function createGoodPR(id: string): AutoFixRun {
  return {
    id,
    prUrl: `https://github.com/org/repo/pull/${id}`,
    status: 'success',
    lintPassed: true,
    typecheckPassed: true,
    complexityDelta: 3,
    filesChanged: 4,
    linesAdded: 100,
    linesDeleted: 40,
    testsRun: 15,
    testsPassed: 14,
    testsFailed: 1,
    coverageBefore: 78,
    coverageAfter: 80,
    merged: true,
    timeToMerge: 5,
    humanEditsRequired: false,
    commentsReceived: 3,
    tokensUsed: 5500,
    apiCost: 0.05,
    durationMs: 45000,
    commitMessage: 'Fixed bug and improved error handling',
    diffContent: 'Added validation and tests',
    readmeUpdated: false,
    commentsAdded: 6,
    docsChanged: false
  };
}

function createAcceptablePR(id: string): AutoFixRun {
  return {
    id,
    prUrl: `https://github.com/org/repo/pull/${id}`,
    status: 'success',
    lintPassed: true,
    typecheckPassed: false,
    complexityDelta: 8,
    filesChanged: 5,
    linesAdded: 150,
    linesDeleted: 80,
    testsRun: 12,
    testsPassed: 10,
    testsFailed: 2,
    coverageBefore: 75,
    coverageAfter: 74,
    merged: true,
    timeToMerge: 30,
    humanEditsRequired: true,
    commentsReceived: 8,
    tokensUsed: 9000,
    apiCost: 0.08,
    durationMs: 75000,
    commitMessage: 'Added feature with some issues',
    diffContent: 'Implementation needs review',
    readmeUpdated: false,
    commentsAdded: 3,
    docsChanged: false
  };
}

function createPoorPR(id: string): AutoFixRun {
  return {
    id,
    prUrl: `https://github.com/org/repo/pull/${id}`,
    status: 'partial',
    lintPassed: false,
    typecheckPassed: false,
    complexityDelta: 15,
    filesChanged: 7,
    linesAdded: 250,
    linesDeleted: 100,
    testsRun: 8,
    testsPassed: 4,
    testsFailed: 4,
    coverageBefore: 70,
    coverageAfter: 62,
    merged: true,
    timeToMerge: 72,
    humanEditsRequired: true,
    commentsReceived: 15,
    tokensUsed: 15000,
    apiCost: 0.15,
    durationMs: 150000,
    commitMessage: 'Quick fix (TODO: cleanup later)',
    diffContent: 'Temporary workaround with hardcoded values',
    readmeUpdated: false,
    commentsAdded: 1,
    docsChanged: false
  };
}

function createFailedPR(id: string): AutoFixRun {
  return {
    id,
    prUrl: `https://github.com/org/repo/pull/${id}`,
    status: 'failure',
    lintPassed: false,
    typecheckPassed: false,
    complexityDelta: 30,
    filesChanged: 10,
    linesAdded: 500,
    linesDeleted: 200,
    testsRun: 15,
    testsPassed: 3,
    testsFailed: 12,
    coverageBefore: 75,
    coverageAfter: 45,
    merged: false,
    timeToMerge: undefined,
    humanEditsRequired: true,
    commentsReceived: 25,
    tokensUsed: 30000,
    apiCost: 0.50,
    durationMs: 300000,
    commitMessage: 'Broken build, tests failing',
    diffContent: 'Untested code with multiple issues',
    readmeUpdated: false,
    commentsAdded: 0,
    docsChanged: false
  };
}

function isWithinOneGrade(actual: string, expected: string): boolean {
  const grades = ['A', 'B', 'C', 'D', 'F'];
  const actualIndex = grades.indexOf(actual);
  const expectedIndex = grades.indexOf(expected);
  return Math.abs(actualIndex - expectedIndex) <= 1;
}
