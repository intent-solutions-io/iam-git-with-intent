/**
 * Tests for Auto-Fix Grading Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AutoFixGradingService, type GradingRubric } from '../auto-fix-grading.js';
import type { AutoFixRun } from '../../scoring/grading-engine.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockRun = (overrides?: Partial<AutoFixRun>): AutoFixRun => ({
  id: 'test-run-123',
  prUrl: 'https://github.com/test/repo/pull/1',
  status: 'success',
  lintPassed: true,
  typecheckPassed: true,
  complexityDelta: 0,
  filesChanged: 3,
  linesAdded: 100,
  linesDeleted: 50,
  testsRun: 10,
  testsPassed: 10,
  testsFailed: 0,
  coverageBefore: 75,
  coverageAfter: 80,
  merged: false,
  humanEditsRequired: false,
  commentsReceived: 0,
  tokensUsed: 5000,
  apiCost: 0.05,
  durationMs: 30000,
  commitMessage: 'fix: resolve authentication bug',
  diffContent: '+ function authenticate() { ... }',
  readmeUpdated: false,
  commentsAdded: 5,
  docsChanged: false,
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('AutoFixGradingService', () => {
  let service: AutoFixGradingService;

  beforeEach(() => {
    service = new AutoFixGradingService({ aiProvider: 'mock' });
  });

  describe('initialization', () => {
    it('should initialize with default rubric', () => {
      const rubric = service.getRubric();
      expect(rubric).toBeDefined();
      expect(rubric.version).toBeDefined();
      expect(rubric.gradeScale).toBeDefined();
    });

    it('should accept custom rubric path', () => {
      // This will fall back to default if file doesn't exist
      const customService = new AutoFixGradingService({
        rubricPath: './examples/default-rubric.json',
        aiProvider: 'mock',
      });
      expect(customService.getRubric()).toBeDefined();
    });

    it('should initialize with mock AI provider', () => {
      expect(service).toBeDefined();
    });
  });

  describe('grade', () => {
    it('should grade a successful fix with high score', async () => {
      const run = createMockRun({
        lintPassed: true,
        typecheckPassed: true,
        testsPassed: 10,
        testsRun: 10,
        merged: true,
      });

      const grade = await service.grade(run, false);

      expect(grade.overallScore).toBeGreaterThan(70);
      expect(grade.letterGrade).toMatch(/[A-C]/);
      expect(grade.metadata.runId).toBe(run.id);
    });

    it('should grade a failed fix with low score', async () => {
      const run = createMockRun({
        lintPassed: false,
        typecheckPassed: false,
        testsPassed: 0,
        testsRun: 10,
        status: 'failure',
      });

      const grade = await service.grade(run, false);

      expect(grade.overallScore).toBeLessThan(60);
      expect(grade.letterGrade).toMatch(/[D-F]/);
      expect(grade.weaknesses.length).toBeGreaterThan(0);
    });

    it('should include criteria scores', async () => {
      const run = createMockRun();
      const grade = await service.grade(run, false);

      expect(grade.criteria).toBeDefined();
      expect(grade.criteria.length).toBeGreaterThan(0);

      const codeQuality = grade.criteria.find(c => c.id === 'code_quality');
      expect(codeQuality).toBeDefined();
      expect(codeQuality?.weight).toBeGreaterThan(0);
    });

    it('should provide strengths and weaknesses', async () => {
      const run = createMockRun();
      const grade = await service.grade(run, false);

      expect(Array.isArray(grade.strengths)).toBe(true);
      expect(Array.isArray(grade.weaknesses)).toBe(true);
      expect(Array.isArray(grade.recommendations)).toBe(true);
    });

    it('should grade with AI assistance when enabled', async () => {
      const run = createMockRun();
      const grade = await service.grade(run, true);

      expect(grade).toBeDefined();
      expect(grade.overallScore).toBeGreaterThanOrEqual(0);
      expect(grade.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('gradeMultiple', () => {
    it('should grade multiple runs', async () => {
      const runs = [
        createMockRun({ id: 'run-1' }),
        createMockRun({ id: 'run-2', lintPassed: false }),
        createMockRun({ id: 'run-3', merged: true }),
      ];

      const grades = await service.gradeMultiple(runs);

      expect(grades).toHaveLength(3);
      expect(grades[0].metadata.runId).toBe('run-1');
      expect(grades[1].metadata.runId).toBe('run-2');
      expect(grades[2].metadata.runId).toBe('run-3');
    });

    it('should handle empty array', async () => {
      const grades = await service.gradeMultiple([]);
      expect(grades).toHaveLength(0);
    });
  });

  describe('rubric validation', () => {
    it('should validate valid rubric', () => {
      const validRubric: GradingRubric = {
        version: '1.0.0',
        criteria: [],
        gradeScale: {
          A: [90, 100],
          B: [80, 89],
          C: [70, 79],
          D: [60, 69],
          F: [0, 59],
        },
      };

      expect(() => AutoFixGradingService.validateRubric(validRubric)).not.toThrow();
    });

    it('should reject invalid rubric', () => {
      const invalidRubric = {
        version: '1.0.0',
        // Missing required fields
      };

      expect(() => AutoFixGradingService.validateRubric(invalidRubric)).toThrow();
    });
  });

  describe('grading criteria', () => {
    it('should reward passing tests', async () => {
      const withTests = createMockRun({
        testsRun: 20,
        testsPassed: 20,
        testsFailed: 0,
      });

      const withoutTests = createMockRun({
        testsRun: 20,
        testsPassed: 10,
        testsFailed: 10,
      });

      const gradeWithTests = await service.grade(withTests, false);
      const gradeWithoutTests = await service.grade(withoutTests, false);

      expect(gradeWithTests.overallScore).toBeGreaterThan(gradeWithoutTests.overallScore);
    });

    it('should reward clean code quality', async () => {
      const clean = createMockRun({
        lintPassed: true,
        typecheckPassed: true,
      });

      const messy = createMockRun({
        lintPassed: false,
        typecheckPassed: false,
      });

      const cleanGrade = await service.grade(clean, false);
      const messyGrade = await service.grade(messy, false);

      expect(cleanGrade.overallScore).toBeGreaterThan(messyGrade.overallScore);
    });

    it('should reward merged PRs', async () => {
      const merged = createMockRun({ merged: true });
      const unmerged = createMockRun({ merged: false });

      const mergedGrade = await service.grade(merged, false);
      const unmergedGrade = await service.grade(unmerged, false);

      expect(mergedGrade.overallScore).toBeGreaterThan(unmergedGrade.overallScore);
    });

    it('should reward cost efficiency', async () => {
      const efficient = createMockRun({
        apiCost: 0.02,
        durationMs: 15000,
      });

      const expensive = createMockRun({
        apiCost: 0.20,
        durationMs: 120000,
      });

      const efficientGrade = await service.grade(efficient, false);
      const expensiveGrade = await service.grade(expensive, false);

      expect(efficientGrade.overallScore).toBeGreaterThan(expensiveGrade.overallScore);
    });

    it('should reward documentation updates', async () => {
      const documented = createMockRun({
        readmeUpdated: true,
        docsChanged: true,
        commentsAdded: 10,
      });

      const undocumented = createMockRun({
        readmeUpdated: false,
        docsChanged: false,
        commentsAdded: 0,
      });

      const documentedGrade = await service.grade(documented, false);
      const undocumentedGrade = await service.grade(undocumented, false);

      expect(documentedGrade.overallScore).toBeGreaterThan(undocumentedGrade.overallScore);
    });
  });

  describe('letter grades', () => {
    it('should assign A grade for excellent runs', async () => {
      const excellent = createMockRun({
        lintPassed: true,
        typecheckPassed: true,
        testsRun: 50,
        testsPassed: 50,
        testsFailed: 0,
        coverageBefore: 70,
        coverageAfter: 85,
        merged: true,
        timeToMerge: 0.5,
        humanEditsRequired: false,
        apiCost: 0.03,
        durationMs: 20000,
        readmeUpdated: true,
        docsChanged: true,
      });

      const grade = await service.grade(excellent, false);
      expect(grade.letterGrade).toBe('A');
      expect(grade.overallScore).toBeGreaterThanOrEqual(90);
    });

    it('should assign F grade for failing runs', async () => {
      const failing = createMockRun({
        lintPassed: false,
        typecheckPassed: false,
        testsRun: 10,
        testsPassed: 0,
        testsFailed: 10,
        status: 'failure',
        merged: false,
      });

      const grade = await service.grade(failing, false);
      expect(grade.letterGrade).toBe('F');
      expect(grade.overallScore).toBeLessThan(60);
    });
  });

  describe('edge cases', () => {
    it('should handle runs with no tests', async () => {
      const noTests = createMockRun({
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
      });

      const grade = await service.grade(noTests, false);
      expect(grade).toBeDefined();
      expect(grade.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle runs with zero duration', async () => {
      const instant = createMockRun({ durationMs: 0 });
      const grade = await service.grade(instant, false);
      expect(grade).toBeDefined();
    });

    it('should handle runs with negative complexity delta', async () => {
      const simplified = createMockRun({ complexityDelta: -5 });
      const grade = await service.grade(simplified, false);
      expect(grade).toBeDefined();
    });
  });
});
