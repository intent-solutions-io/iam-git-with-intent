/**
 * Coder Agent Tests
 *
 * Phase 4: Tests for CoderAgent file I/O functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { CoderAgent, type CoderRunInput } from '../index.js';
import type { IssueMetadata, ComplexityScore } from '@gwi/core';
import { getWorkspacePaths } from '@gwi/core';


// Mock model selector with realistic code generation responses
vi.mock('@gwi/core/models', () => ({
  createModelSelector: vi.fn(() => ({
    chat: vi.fn(() => Promise.resolve({
      content: JSON.stringify({
        files: [
          {
            path: 'src/feature/new-file.ts',
            content: 'export function hello() { return "Hello World"; }',
            action: 'create',
            explanation: 'New feature implementation',
          },
          {
            path: 'src/feature/new-file.test.ts',
            content: 'import { hello } from "./new-file"; test("hello", () => { expect(hello()).toBe("Hello World"); });',
            action: 'create',
            explanation: 'Unit tests for new feature',
          },
        ],
        summary: 'Added new hello feature with tests',
        confidence: 85,
        testsIncluded: true,
        estimatedComplexity: 3,
      }),
      model: 'claude-sonnet',
      tokensUsed: { input: 500, output: 200 },
      finishReason: 'stop',
    })),
  })),
  MODELS: {
    anthropic: {
      haiku: 'claude-3-haiku-20240307',
      sonnet: 'claude-sonnet-4-20250514',
      opus: 'claude-opus-4-20250514',
    },
    google: {
      flash: 'gemini-2.0-flash-exp',
      pro: 'gemini-1.5-pro',
    },
  },
}));

describe('CoderAgent', () => {
  let coder: CoderAgent;
  let testRunId: string;

  const createMockIssue = (number: number = 1): IssueMetadata => ({
    url: `https://github.com/test/repo/issues/${number}`,
    number,
    title: `Test Issue #${number}`,
    body: 'Add a new hello feature that returns "Hello World"',
    author: 'test-user',
    labels: ['enhancement'],
    assignees: [],
    milestone: undefined,
    repo: {
      owner: 'test',
      name: 'repo',
      fullName: 'test/repo',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    coder = new CoderAgent();
    await coder.initialize();
    testRunId = `test-run-${Date.now()}`;
  });

  afterEach(async () => {
    await coder.shutdown();
    // Clean up workspace artifacts
    if (testRunId) {
      const { runsDir } = getWorkspacePaths();
      try {
        await rm(join(runsDir, testRunId), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('generateCodeWithArtifacts', () => {
    it('should create workspace directory for run', async () => {
      const input: CoderRunInput = {
        runId: testRunId,
        issue: createMockIssue(),
        complexity: 5 as ComplexityScore,
        triageSummary: 'Test triage summary',
      };

      const result = await coder.generateCodeWithArtifacts(input);

      expect(result.artifacts).toBeDefined();
      expect(result.artifacts.planPath).toContain(testRunId);

      // Verify directory exists
      const { runsDir } = getWorkspacePaths();
      const runDir = join(runsDir, testRunId);
      const dirStat = await stat(runDir);
      expect(dirStat.isDirectory()).toBe(true);
    });

    it('should write plan.md with correct content', async () => {
      const input: CoderRunInput = {
        runId: testRunId,
        issue: createMockIssue(42),
        complexity: 3 as ComplexityScore,
        triageSummary: 'Simple feature request',
      };

      const result = await coder.generateCodeWithArtifacts(input);

      const planContent = await readFile(result.artifacts.planPath, 'utf-8');

      expect(planContent).toContain('# Code Generation Plan');
      expect(planContent).toContain('Simple feature request');
      expect(planContent).toContain('Confidence:');
      expect(planContent).toContain('Files to Generate');
    });

    it('should write patch files for each generated file', async () => {
      const input: CoderRunInput = {
        runId: testRunId,
        issue: createMockIssue(),
        complexity: 5 as ComplexityScore,
      };

      const result = await coder.generateCodeWithArtifacts(input);

      // Should have 2 patch files (one for each file in mock response)
      expect(result.artifacts.patchPaths).toHaveLength(2);

      // Verify first patch file
      const patch1Content = await readFile(result.artifacts.patchPaths[0], 'utf-8');
      expect(patch1Content).toContain('Patch for: src/feature/new-file.ts');
      expect(patch1Content).toContain('Action: create');
      expect(patch1Content).toContain('hello');

      // Verify second patch file
      const patch2Content = await readFile(result.artifacts.patchPaths[1], 'utf-8');
      expect(patch2Content).toContain('Patch for: src/feature/new-file.test.ts');
    });

    it('should return code generation result with confidence', async () => {
      const input: CoderRunInput = {
        runId: testRunId,
        issue: createMockIssue(),
        complexity: 5 as ComplexityScore,
      };

      const result = await coder.generateCodeWithArtifacts(input);

      expect(result.code.confidence).toBe(85);
      expect(result.code.testsIncluded).toBe(true);
      expect(result.code.files).toHaveLength(2);
      expect(result.code.summary).toContain('hello feature');
    });

    it('should include notes in artifacts', async () => {
      const input: CoderRunInput = {
        runId: testRunId,
        issue: createMockIssue(),
        complexity: 5 as ComplexityScore,
      };

      const result = await coder.generateCodeWithArtifacts(input);

      expect(result.artifacts.notes).toContain('Generated 2 file(s)');
      expect(result.artifacts.notes).toContain('85% confidence');
    });

    it('should sanitize runId to prevent path traversal', async () => {
      const maliciousRunId = '../../../etc/passwd';
      const input: CoderRunInput = {
        runId: maliciousRunId,
        issue: createMockIssue(),
        complexity: 5 as ComplexityScore,
      };

      const result = await coder.generateCodeWithArtifacts(input);

      // Path should not contain path traversal
      expect(result.artifacts.planPath).not.toContain('..');
      expect(result.artifacts.planPath).toContain('_');

      // Clean up the sanitized directory
      const { runsDir } = getWorkspacePaths();
      const sanitizedRunId = maliciousRunId.replace(/[^a-zA-Z0-9_-]/g, '_');
      try {
        await rm(join(runsDir, sanitizedRunId), { recursive: true, force: true });
      } catch {
        // Ignore
      }
    });
  });
});
