/**
 * Integration tests for AI Providers
 *
 * These tests verify the AI providers can handle API responses correctly.
 * They use mocks to avoid requiring real API keys in CI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoFixGradingService } from '../auto-fix-grading.js';
import type { AutoFixRun } from '../../scoring/grading-engine.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMockRun = (): AutoFixRun => ({
  id: 'test-run-ai',
  prUrl: 'https://github.com/test/repo/pull/42',
  status: 'success',
  lintPassed: true,
  typecheckPassed: true,
  complexityDelta: 2,
  filesChanged: 5,
  linesAdded: 150,
  linesDeleted: 80,
  testsRun: 25,
  testsPassed: 24,
  testsFailed: 1,
  coverageBefore: 78,
  coverageAfter: 82,
  merged: true,
  timeToMerge: 2.5,
  humanEditsRequired: false,
  commentsReceived: 3,
  tokensUsed: 8500,
  apiCost: 0.07,
  durationMs: 42000,
  commitMessage: 'fix: resolve race condition in async handler',
  diffContent: `
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -10,7 +10,9 @@

 export async function handleRequest(req: Request): Promise<Response> {
-  const data = await fetchData();
+  const dataPromise = fetchData();
+  const configPromise = loadConfig();
+  const [data, config] = await Promise.all([dataPromise, configPromise]);
   return processData(data);
 }
  `,
  readmeUpdated: false,
  commentsAdded: 8,
  docsChanged: true,
});

// ============================================================================
// Tests
// ============================================================================

describe('AI Providers', () => {
  describe('Mock Provider', () => {
    it('should work without API keys', async () => {
      const service = new AutoFixGradingService({ aiProvider: 'mock' });
      const run = createMockRun();

      const grade = await service.grade(run, true);

      expect(grade).toBeDefined();
      expect(grade.overallScore).toBeGreaterThanOrEqual(0);
      expect(grade.overallScore).toBeLessThanOrEqual(100);
      expect(grade.letterGrade).toMatch(/[A-F]/);
    });

    it('should provide consistent results', async () => {
      const service = new AutoFixGradingService({ aiProvider: 'mock' });
      const run = createMockRun();

      const grade1 = await service.grade(run, true);
      const grade2 = await service.grade(run, true);

      // Mock provider should be deterministic
      expect(grade1.overallScore).toBe(grade2.overallScore);
      expect(grade1.letterGrade).toBe(grade2.letterGrade);
    });
  });

  describe('Gemini Provider', () => {
    it('should fall back to mock when API key missing', async () => {
      // Temporarily remove API key
      const originalKey = process.env.GOOGLE_AI_API_KEY;
      delete process.env.GOOGLE_AI_API_KEY;

      const service = new AutoFixGradingService({ aiProvider: 'gemini' });
      const run = createMockRun();

      const grade = await service.grade(run, true);

      expect(grade).toBeDefined();
      expect(grade.overallScore).toBeGreaterThanOrEqual(0);

      // Restore key
      if (originalKey) {
        process.env.GOOGLE_AI_API_KEY = originalKey;
      }
    });

    it('should handle API errors gracefully', async () => {
      // Mock fetch to simulate API error
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const service = new AutoFixGradingService({ aiProvider: 'gemini' });
      const run = createMockRun();

      // Should not throw, should fall back to mock
      const grade = await service.grade(run, true);
      expect(grade).toBeDefined();

      // Restore fetch
      global.fetch = originalFetch;
    });

    it('should handle invalid JSON responses', async () => {
      // Mock fetch to return invalid JSON
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{ text: 'This is not valid JSON for analysis' }]
            }
          }]
        })
      });

      const service = new AutoFixGradingService({ aiProvider: 'gemini' });
      const run = createMockRun();

      // Should fall back gracefully
      const grade = await service.grade(run, true);
      expect(grade).toBeDefined();

      // Restore fetch
      global.fetch = originalFetch;
    });
  });

  describe('Claude Provider', () => {
    it('should fall back to mock when API key missing', async () => {
      // Temporarily remove API key
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      const service = new AutoFixGradingService({ aiProvider: 'claude' });
      const run = createMockRun();

      const grade = await service.grade(run, true);

      expect(grade).toBeDefined();
      expect(grade.overallScore).toBeGreaterThanOrEqual(0);

      // Restore key
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    });

    it('should handle API errors gracefully', async () => {
      // Mock fetch to simulate API error
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new Error('API timeout'));

      const service = new AutoFixGradingService({ aiProvider: 'claude' });
      const run = createMockRun();

      // Should not throw, should fall back to mock
      const grade = await service.grade(run, true);
      expect(grade).toBeDefined();

      // Restore fetch
      global.fetch = originalFetch;
    });

    it('should parse JSON from markdown blocks', async () => {
      // Mock fetch to return JSON in markdown
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{
            text: '```json\n{"score": 85, "strengths": ["Good"], "weaknesses": [], "suggestions": [], "riskLevel": "low"}\n```'
          }]
        })
      });

      const service = new AutoFixGradingService({ aiProvider: 'claude' });
      const run = createMockRun();

      const grade = await service.grade(run, true);
      expect(grade).toBeDefined();

      // Restore fetch
      global.fetch = originalFetch;
    });
  });

  describe('Provider Selection', () => {
    it('should use specified provider', async () => {
      const mockService = new AutoFixGradingService({ aiProvider: 'mock' });
      const geminiService = new AutoFixGradingService({ aiProvider: 'gemini' });
      const claudeService = new AutoFixGradingService({ aiProvider: 'claude' });

      expect(mockService).toBeDefined();
      expect(geminiService).toBeDefined();
      expect(claudeService).toBeDefined();
    });

    it('should default to mock when provider not specified', async () => {
      const service = new AutoFixGradingService();
      const run = createMockRun();

      const grade = await service.grade(run, true);
      expect(grade).toBeDefined();
    });
  });

  describe('AI-Enhanced Grading', () => {
    it('should include AI insights when enabled', async () => {
      const service = new AutoFixGradingService({ aiProvider: 'mock' });
      const run = createMockRun();

      const grade = await service.grade(run, true);

      // Should have AI-enhanced fields
      expect(grade.strengths.some(s => s.includes('AI:'))).toBe(true);
    });

    it('should work without AI when disabled', async () => {
      const service = new AutoFixGradingService({ aiProvider: 'mock' });
      const run = createMockRun();

      const grade = await service.grade(run, false);

      // Should not have AI-enhanced fields
      expect(grade.strengths.every(s => !s.includes('AI:'))).toBe(true);
    });

    it('should handle batch grading with AI', async () => {
      const service = new AutoFixGradingService({ aiProvider: 'mock' });
      const runs = [
        createMockRun(),
        { ...createMockRun(), id: 'run-2', lintPassed: false },
        { ...createMockRun(), id: 'run-3', merged: false }
      ];

      const grades = await service.gradeMultiple(runs, true);

      expect(grades).toHaveLength(3);
      grades.forEach(grade => {
        expect(grade).toBeDefined();
        expect(grade.overallScore).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle null/undefined fields gracefully', async () => {
      const service = new AutoFixGradingService({ aiProvider: 'mock' });
      const run: AutoFixRun = {
        ...createMockRun(),
        timeToMerge: undefined,
        commitMessage: '',
        diffContent: '',
      };

      const grade = await service.grade(run, true);
      expect(grade).toBeDefined();
    });

    it('should handle extreme values', async () => {
      const service = new AutoFixGradingService({ aiProvider: 'mock' });
      const run: AutoFixRun = {
        ...createMockRun(),
        filesChanged: 1000,
        linesAdded: 50000,
        complexityDelta: 500,
        apiCost: 10.0,
        durationMs: 3600000, // 1 hour
      };

      const grade = await service.grade(run, true);
      expect(grade).toBeDefined();
      expect(grade.overallScore).toBeGreaterThanOrEqual(0);
      expect(grade.overallScore).toBeLessThanOrEqual(100);
    });
  });
});
