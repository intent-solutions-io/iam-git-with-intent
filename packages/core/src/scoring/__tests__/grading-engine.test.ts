/**
 * Grading Engine Tests
 *
 * Validates scoring logic, letter grade conversion, and explanations
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GradingEngine, type AutoFixRun, type GradeResult } from '../grading-engine.js';

describe('GradingEngine', () => {
  let engine: GradingEngine;

  beforeAll(() => {
    engine = new GradingEngine();
  });

  // ============================================================================
  // Test Helper: Create Mock Run
  // ============================================================================

  function createMockRun(overrides: Partial<AutoFixRun> = {}): AutoFixRun {
    return {
      id: 'run-123',
      prUrl: 'https://github.com/owner/repo/pull/1',
      status: 'success',
      lintPassed: true,
      typecheckPassed: true,
      complexityDelta: 0,
      filesChanged: 5,
      linesAdded: 100,
      linesDeleted: 50,
      testsRun: 10,
      testsPassed: 10,
      testsFailed: 0,
      coverageBefore: 80,
      coverageAfter: 85,
      merged: true,
      timeToMerge: 2,
      humanEditsRequired: false,
      commentsReceived: 2,
      tokensUsed: 5000,
      apiCost: 0.05,
      durationMs: 30000,
      commitMessage: 'Fixed authentication bug',
      diffContent: 'Added input validation',
      readmeUpdated: false,
      commentsAdded: 5,
      docsChanged: false,
      ...overrides
    };
  }

  // ============================================================================
  // Code Quality Tests
  // ============================================================================

  describe('Code Quality Scoring', () => {
    it('should give full score for perfect code quality', () => {
      const run = createMockRun({
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: -5 // Reduced complexity
      });

      const result = engine.grade(run);
      const codeQuality = result.criteria.find(c => c.id === 'code_quality')!;

      expect(codeQuality.score).toBeGreaterThanOrEqual(90);
      expect(codeQuality.subcriteria.every(s => s.passed)).toBe(true);
    });

    it('should penalize linting failures', () => {
      const run = createMockRun({ lintPassed: false });
      const result = engine.grade(run);
      const codeQuality = result.criteria.find(c => c.id === 'code_quality')!;

      expect(codeQuality.score).toBeLessThan(70);
      const lintSub = codeQuality.subcriteria.find(s => s.id === 'lint_passed')!;
      expect(lintSub.passed).toBe(false);
    });

    it('should penalize typecheck failures', () => {
      const run = createMockRun({ typecheckPassed: false });
      const result = engine.grade(run);
      const codeQuality = result.criteria.find(c => c.id === 'code_quality')!;

      expect(codeQuality.score).toBeLessThan(70);
      const typecheckSub = codeQuality.subcriteria.find(s => s.id === 'typecheck_passed')!;
      expect(typecheckSub.passed).toBe(false);
    });

    it('should penalize increased complexity', () => {
      const run = createMockRun({ complexityDelta: 15 });
      const result = engine.grade(run);
      const codeQuality = result.criteria.find(c => c.id === 'code_quality')!;

      const complexitySub = codeQuality.subcriteria.find(s => s.id === 'complexity_delta')!;
      expect(complexitySub.passed).toBe(false);
      expect(complexitySub.score).toBeLessThan(20);
    });

    it('should reward reduced complexity', () => {
      const run = createMockRun({ complexityDelta: -10 });
      const result = engine.grade(run);
      const codeQuality = result.criteria.find(c => c.id === 'code_quality')!;

      const complexitySub = codeQuality.subcriteria.find(s => s.id === 'complexity_delta')!;
      expect(complexitySub.passed).toBe(true);
    });
  });

  // ============================================================================
  // Test Coverage Tests
  // ============================================================================

  describe('Test Coverage Scoring', () => {
    it('should give full score for complete test coverage', () => {
      const run = createMockRun({
        testsRun: 20,
        testsPassed: 20,
        testsFailed: 0,
        coverageBefore: 80,
        coverageAfter: 90
      });

      const result = engine.grade(run);
      const testCoverage = result.criteria.find(c => c.id === 'test_coverage')!;

      expect(testCoverage.score).toBeGreaterThanOrEqual(90);
    });

    it('should penalize no tests', () => {
      const run = createMockRun({
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0
      });

      const result = engine.grade(run);
      const testCoverage = result.criteria.find(c => c.id === 'test_coverage')!;

      expect(testCoverage.score).toBeLessThan(50);
      const testsRunSub = testCoverage.subcriteria.find(s => s.id === 'tests_run')!;
      expect(testsRunSub.passed).toBe(false);
    });

    it('should penalize failing tests', () => {
      const run = createMockRun({
        testsRun: 10,
        testsPassed: 6,
        testsFailed: 4
      });

      const result = engine.grade(run);
      const testCoverage = result.criteria.find(c => c.id === 'test_coverage')!;

      const testsPassedSub = testCoverage.subcriteria.find(s => s.id === 'tests_passed')!;
      expect(testsPassedSub.score).toBeLessThan(40);
    });

    it('should reward coverage improvement', () => {
      const run = createMockRun({
        coverageBefore: 70,
        coverageAfter: 85
      });

      const result = engine.grade(run);
      const testCoverage = result.criteria.find(c => c.id === 'test_coverage')!;

      const coverageSub = testCoverage.subcriteria.find(s => s.id === 'coverage_improvement')!;
      expect(coverageSub.passed).toBe(true);
      expect(coverageSub.score).toBeGreaterThan(0);
    });

    it('should penalize coverage decrease', () => {
      const run = createMockRun({
        coverageBefore: 85,
        coverageAfter: 75
      });

      const result = engine.grade(run);
      const testCoverage = result.criteria.find(c => c.id === 'test_coverage')!;

      const coverageSub = testCoverage.subcriteria.find(s => s.id === 'coverage_improvement')!;
      expect(coverageSub.passed).toBe(false);
      expect(coverageSub.score).toBe(0);
    });
  });

  // ============================================================================
  // PR Outcome Tests
  // ============================================================================

  describe('PR Outcome Scoring', () => {
    it('should give full score for perfect PR outcome', () => {
      const run = createMockRun({
        merged: true,
        timeToMerge: 0.5,
        humanEditsRequired: false
      });

      const result = engine.grade(run);
      const prOutcome = result.criteria.find(c => c.id === 'pr_outcome')!;

      expect(prOutcome.score).toBeGreaterThanOrEqual(90);
    });

    it('should penalize unmerged PRs', () => {
      const run = createMockRun({ merged: false });
      const result = engine.grade(run);
      const prOutcome = result.criteria.find(c => c.id === 'pr_outcome')!;

      expect(prOutcome.score).toBeLessThan(60);
      const mergedSub = prOutcome.subcriteria.find(s => s.id === 'pr_merged')!;
      expect(mergedSub.passed).toBe(false);
    });

    it('should reward fast merges', () => {
      const run = createMockRun({
        merged: true,
        timeToMerge: 0.5
      });

      const result = engine.grade(run);
      const prOutcome = result.criteria.find(c => c.id === 'pr_outcome')!;
      const timeSub = prOutcome.subcriteria.find(s => s.id === 'time_to_merge')!;

      expect(timeSub.score).toBeGreaterThanOrEqual(20);
    });

    it('should penalize slow merges', () => {
      const run = createMockRun({
        merged: true,
        timeToMerge: 72
      });

      const result = engine.grade(run);
      const prOutcome = result.criteria.find(c => c.id === 'pr_outcome')!;
      const timeSub = prOutcome.subcriteria.find(s => s.id === 'time_to_merge')!;

      expect(timeSub.score).toBeLessThan(15);
    });

    it('should penalize human edits required', () => {
      const run = createMockRun({ humanEditsRequired: true });
      const result = engine.grade(run);
      const prOutcome = result.criteria.find(c => c.id === 'pr_outcome')!;

      const editsSub = prOutcome.subcriteria.find(s => s.id === 'human_edits')!;
      expect(editsSub.passed).toBe(false);
      expect(editsSub.score).toBe(0);
    });
  });

  // ============================================================================
  // Cost Efficiency Tests
  // ============================================================================

  describe('Cost Efficiency Scoring', () => {
    it('should reward low API costs', () => {
      const run = createMockRun({
        apiCost: 0.01,
        durationMs: 15000
      });

      const result = engine.grade(run);
      const costEff = result.criteria.find(c => c.id === 'cost_efficiency')!;

      expect(costEff.score).toBeGreaterThan(70);
    });

    it('should penalize high API costs', () => {
      const run = createMockRun({ apiCost: 0.50 });
      const result = engine.grade(run);
      const costEff = result.criteria.find(c => c.id === 'cost_efficiency')!;

      const costSub = costEff.subcriteria.find(s => s.id === 'api_cost')!;
      expect(costSub.score).toBeLessThan(25);
    });

    it('should reward fast execution', () => {
      const run = createMockRun({ durationMs: 10000 });
      const result = engine.grade(run);
      const costEff = result.criteria.find(c => c.id === 'cost_efficiency')!;

      const durationSub = costEff.subcriteria.find(s => s.id === 'duration')!;
      expect(durationSub.score).toBeGreaterThan(30);
    });

    it('should penalize slow execution', () => {
      const run = createMockRun({ durationMs: 120000 });
      const result = engine.grade(run);
      const costEff = result.criteria.find(c => c.id === 'cost_efficiency')!;

      const durationSub = costEff.subcriteria.find(s => s.id === 'duration')!;
      expect(durationSub.score).toBeLessThan(25);
    });
  });

  // ============================================================================
  // Documentation Tests
  // ============================================================================

  describe('Documentation Scoring', () => {
    it('should reward complete documentation', () => {
      const run = createMockRun({
        readmeUpdated: true,
        commentsAdded: 15,
        docsChanged: true
      });

      const result = engine.grade(run);
      const docs = result.criteria.find(c => c.id === 'documentation')!;

      expect(docs.score).toBeGreaterThanOrEqual(80);
    });

    it('should penalize missing README updates', () => {
      const run = createMockRun({ readmeUpdated: false });
      const result = engine.grade(run);
      const docs = result.criteria.find(c => c.id === 'documentation')!;

      const readmeSub = docs.subcriteria.find(s => s.id === 'readme_updated')!;
      expect(readmeSub.passed).toBe(false);
    });

    it('should reward code comments', () => {
      const run = createMockRun({ commentsAdded: 20 });
      const result = engine.grade(run);
      const docs = result.criteria.find(c => c.id === 'documentation')!;

      const commentsSub = docs.subcriteria.find(s => s.id === 'comments_added')!;
      expect(commentsSub.score).toBeGreaterThan(15);
    });
  });

  // ============================================================================
  // Letter Grade Tests
  // ============================================================================

  describe('Letter Grade Conversion', () => {
    it('should assign grade A for excellent quality (90-100)', () => {
      const run = createMockRun({
        lintPassed: true,
        typecheckPassed: true,
        complexityDelta: -5,
        testsRun: 20,
        testsPassed: 20,
        coverageAfter: 95,
        merged: true,
        timeToMerge: 1,
        humanEditsRequired: false,
        apiCost: 0.02,
        durationMs: 20000,
        readmeUpdated: true,
        docsChanged: true
      });

      const result = engine.grade(run);
      expect(result.letterGrade).toBe('A');
      expect(result.overallScore).toBeGreaterThanOrEqual(90);
    });

    it('should assign grade B for good quality (80-89)', () => {
      const run = createMockRun({
        lintPassed: true,
        typecheckPassed: true,
        testsRun: 10,
        testsPassed: 9,
        merged: true,
        timeToMerge: 5
      });

      const result = engine.grade(run);
      expect(['B', 'A']).toContain(result.letterGrade);
    });

    it('should assign grade F for poor quality (<60)', () => {
      const run = createMockRun({
        lintPassed: false,
        typecheckPassed: false,
        testsRun: 0,
        testsPassed: 0,
        merged: false,
        humanEditsRequired: true,
        apiCost: 1.0,
        durationMs: 300000
      });

      const result = engine.grade(run);
      expect(result.letterGrade).toBe('F');
      expect(result.overallScore).toBeLessThan(60);
    });
  });

  // ============================================================================
  // Explanation Tests
  // ============================================================================

  describe('Explanations and Recommendations', () => {
    it('should identify strengths in high-quality runs', () => {
      const run = createMockRun({
        lintPassed: true,
        typecheckPassed: true,
        testsRun: 20,
        testsPassed: 20
      });

      const result = engine.grade(run);
      expect(result.strengths.length).toBeGreaterThan(0);
    });

    it('should identify weaknesses in low-quality runs', () => {
      const run = createMockRun({
        lintPassed: false,
        testsRun: 0,
        merged: false
      });

      const result = engine.grade(run);
      expect(result.weaknesses.length).toBeGreaterThan(0);
    });

    it('should provide recommendations for improvement', () => {
      const run = createMockRun({
        lintPassed: false,
        testsRun: 0,
        readmeUpdated: false
      });

      const result = engine.grade(run);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some(r =>
        r.toLowerCase().includes('lint') ||
        r.toLowerCase().includes('test') ||
        r.toLowerCase().includes('documentation')
      )).toBe(true);
    });

    it('should generate summary with grade and score', () => {
      const run = createMockRun();
      const result = engine.grade(run);

      expect(result.summary).toContain(result.letterGrade);
      expect(result.summary).toContain(result.overallScore.toFixed(1));
    });
  });

  // ============================================================================
  // Determinism Tests
  // ============================================================================

  describe('Deterministic Grading', () => {
    it('should produce identical results for identical inputs', () => {
      const run = createMockRun();

      const result1 = engine.grade(run);
      const result2 = engine.grade(run);

      expect(result1.overallScore).toBe(result2.overallScore);
      expect(result1.letterGrade).toBe(result2.letterGrade);
      expect(result1.criteria.length).toBe(result2.criteria.length);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should grade in under 100ms', () => {
      const run = createMockRun();
      const start = Date.now();
      engine.grade(run);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
