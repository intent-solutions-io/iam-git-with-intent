/**
 * Reviewer Agent Tests
 *
 * Tests for ReviewerAgent validation functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReviewerAgent } from '../index.js';
import type { ResolutionResult, ConflictInfo, ComplexityScore, IssueMetadata, CodeGenerationResult } from '@gwi/core';

// Mock AgentFS
vi.mock('@gwi/core/agentfs', () => ({
  openAgentFS: vi.fn(() => Promise.resolve({
    kv: {
      get: vi.fn(() => Promise.resolve(null)),
      set: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve()),
      list: vi.fn(() => Promise.resolve([])),
    },
    fs: {
      writeFile: vi.fn(() => Promise.resolve()),
      readFile: vi.fn(() => Promise.resolve(Buffer.from(''))),
      readdir: vi.fn(() => Promise.resolve([])),
      mkdir: vi.fn(() => Promise.resolve()),
      unlink: vi.fn(() => Promise.resolve()),
      exists: vi.fn(() => Promise.resolve(false)),
    },
    tools: {
      record: vi.fn(() => Promise.resolve()),
      list: vi.fn(() => Promise.resolve([])),
    },
  })),
  createAgentId: vi.fn((name: string) => `spiffe://intent.solutions/agent/${name}`),
  AuditLogger: vi.fn().mockImplementation(() => ({
    record: vi.fn(async <T>(_name: string, _input: unknown, fn: () => Promise<T>) => fn()),
    getRecent: vi.fn(() => Promise.resolve([])),
  })),
}));

// Mock model selector with realistic review responses
vi.mock('@gwi/core/models', () => ({
  createModelSelector: vi.fn(() => ({
    chat: vi.fn(() => Promise.resolve({
      content: JSON.stringify({
        approved: true,
        syntaxValid: true,
        codeLossDetected: false,
        securityIssues: [],
        suggestions: ['Consider adding type annotations'],
        confidence: 90,
        reasoning: 'Code looks good, no issues detected',
      }),
      model: 'claude-sonnet-4-20250514',
      tokensUsed: { input: 800, output: 300 },
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

describe('ReviewerAgent', () => {
  let reviewer: ReviewerAgent;

  const createMockResolution = (): ResolutionResult => ({
    file: 'src/utils/helper.ts',
    resolvedContent: `function helper() {
  return "merged result";
}

export { helper };`,
    explanation: 'Merged both changes as they were compatible',
    confidence: 85,
    strategy: 'merge-both',
  });

  const createMockConflict = (): ConflictInfo => ({
    file: 'src/utils/helper.ts',
    baseContent: 'function helper() { return "base"; }',
    oursContent: 'function helper() { return "ours"; }\nexport { helper };',
    theirsContent: 'function helper() { return "theirs"; }',
    conflictMarkers: `<<<<<<< HEAD
function helper() { return "ours"; }
=======
function helper() { return "theirs"; }
>>>>>>> main`,
    complexity: 5 as ComplexityScore,
  });

  beforeEach(async () => {
    reviewer = new ReviewerAgent();
    await reviewer.initialize();
  });

  afterEach(async () => {
    await reviewer.shutdown();
  });

  describe('review (conflict resolution)', () => {
    it('should approve valid resolution', async () => {
      const resolution = createMockResolution();
      const conflict = createMockConflict();

      const result = await reviewer.review(resolution, conflict);

      expect(result.review.approved).toBe(true);
      expect(result.review.syntaxValid).toBe(true);
      expect(result.shouldEscalate).toBe(false);
    });

    it('should reject resolution with syntax errors', async () => {
      const resolution: ResolutionResult = {
        file: 'test.ts',
        resolvedContent: 'function broken( { return "missing closing paren"; }',
        explanation: 'Bad resolution',
        confidence: 50,
        strategy: 'custom',
      };
      const conflict = createMockConflict();

      const result = await reviewer.review(resolution, conflict);

      expect(result.review.syntaxValid).toBe(false);
      expect(result.review.approved).toBe(false);
      expect(result.shouldEscalate).toBe(true);
      expect(result.escalationReason).toContain('Syntax');
    });

    it('should detect hardcoded passwords as critical security issue', async () => {
      const resolution: ResolutionResult = {
        file: 'config.ts',
        resolvedContent: 'const password = "secret123";',
        explanation: 'Added config',
        confidence: 80,
        strategy: 'accept-ours',
      };
      const conflict = createMockConflict();

      const result = await reviewer.review(resolution, conflict);

      expect(result.review.approved).toBe(false);
      expect(result.review.securityIssues.length).toBeGreaterThan(0);
      expect(result.shouldEscalate).toBe(true);
      expect(result.escalationReason).toContain('Critical security');
    });

    it('should detect API keys as critical security issue', async () => {
      const resolution: ResolutionResult = {
        file: 'config.ts',
        resolvedContent: 'const apiKey = "sk-1234567890abcdef";',
        explanation: 'Added API key',
        confidence: 80,
        strategy: 'accept-ours',
      };
      const conflict = createMockConflict();

      const result = await reviewer.review(resolution, conflict);

      expect(result.review.securityIssues.length).toBeGreaterThan(0);
      expect(result.shouldEscalate).toBe(true);
    });

    it('should detect eval usage as security issue', async () => {
      const resolution: ResolutionResult = {
        file: 'unsafe.ts',
        resolvedContent: 'const result = eval(userInput);',
        explanation: 'Added eval',
        confidence: 50,
        strategy: 'accept-ours',
      };
      const conflict = createMockConflict();

      const result = await reviewer.review(resolution, conflict);

      expect(result.review.securityIssues.some((i) => i.includes('eval'))).toBe(true);
    });

    it('should detect innerHTML as security issue', async () => {
      const resolution: ResolutionResult = {
        file: 'component.ts',
        resolvedContent: 'element.innerHTML = userContent;',
        explanation: 'Render HTML',
        confidence: 70,
        strategy: 'accept-ours',
      };
      const conflict = createMockConflict();

      const result = await reviewer.review(resolution, conflict);

      expect(result.review.securityIssues.some((i) => i.includes('innerHTML'))).toBe(true);
    });
  });

  describe('syntax validation', () => {
    it('should validate balanced brackets', async () => {
      const goodResolution: ResolutionResult = {
        file: 'test.ts',
        resolvedContent: `function test() {
  const arr = [1, 2, 3];
  const obj = { a: 1, b: 2 };
  return arr.map((x) => x * 2);
}`,
        explanation: 'Good code',
        confidence: 90,
        strategy: 'merge-both',
      };
      const conflict = createMockConflict();

      const result = await reviewer.review(goodResolution, conflict);

      expect(result.review.syntaxValid).toBe(true);
    });

    it('should detect unbalanced brackets', async () => {
      const badResolution: ResolutionResult = {
        file: 'test.ts',
        resolvedContent: 'function test() { const obj = { a: 1 }',
        explanation: 'Missing closing brace',
        confidence: 50,
        strategy: 'custom',
      };
      const conflict = createMockConflict();

      const result = await reviewer.review(badResolution, conflict);

      expect(result.review.syntaxValid).toBe(false);
    });

    it('should handle string literals correctly', async () => {
      const resolution: ResolutionResult = {
        file: 'test.ts',
        resolvedContent: `const msg = "Hello { world }";
const template = \`Value: \${obj.value}\`;`,
        explanation: 'Strings with brackets',
        confidence: 85,
        strategy: 'merge-both',
      };
      const conflict = createMockConflict();

      const result = await reviewer.review(resolution, conflict);

      expect(result.review.syntaxValid).toBe(true);
    });
  });

  describe('reviewCode (code generation)', () => {
    const createMockIssue = (): IssueMetadata => ({
      url: 'https://github.com/test/repo/issues/1',
      number: 1,
      title: 'Add hello feature',
      body: 'Please add a hello function',
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

    const createMockCodeResult = (): CodeGenerationResult => ({
      files: [
        {
          path: 'src/hello.ts',
          content: `export function hello(name: string): string {
  return \`Hello, \${name}!\`;
}`,
          action: 'create',
          explanation: 'New hello function',
        },
        {
          path: 'src/hello.test.ts',
          content: `import { hello } from './hello';
describe('hello', () => {
  it('should greet by name', () => {
    expect(hello('World')).toBe('Hello, World!');
  });
});`,
          action: 'create',
          explanation: 'Unit tests for hello',
        },
      ],
      summary: 'Added hello function with tests',
      confidence: 90,
      testsIncluded: true,
      estimatedComplexity: 2 as ComplexityScore,
    });

    it('should approve valid generated code', async () => {
      const codeResult = createMockCodeResult();
      const issue = createMockIssue();

      const result = await reviewer.reviewCode(codeResult, issue);

      expect(result.review.approved).toBe(true);
      expect(result.review.syntaxValid).toBe(true);
      expect(result.shouldEscalate).toBe(false);
    });

    it('should reject code with syntax errors', async () => {
      const badCodeResult: CodeGenerationResult = {
        files: [
          {
            path: 'src/broken.ts',
            content: 'export function broken( { return "bad"; }',
            action: 'create',
            explanation: 'Broken code',
          },
        ],
        summary: 'Broken code',
        confidence: 30,
        testsIncluded: false,
        estimatedComplexity: 1 as ComplexityScore,
      };
      const issue = createMockIssue();

      const result = await reviewer.reviewCode(badCodeResult, issue);

      expect(result.review.syntaxValid).toBe(false);
      expect(result.review.approved).toBe(false);
      expect(result.shouldEscalate).toBe(true);
    });

    it('should flag low confidence code for review', async () => {
      const lowConfidenceResult: CodeGenerationResult = {
        files: [
          {
            path: 'src/uncertain.ts',
            content: 'export const x = 1;',
            action: 'create',
            explanation: 'Not sure what to do',
          },
        ],
        summary: 'Low confidence result',
        confidence: 30,
        testsIncluded: false,
        estimatedComplexity: 5 as ComplexityScore,
      };
      const issue = createMockIssue();

      const result = await reviewer.reviewCode(lowConfidenceResult, issue);

      expect(result.review.suggestions.some((s) => s.includes('low confidence'))).toBe(true);
    });

    it('should detect security issues in generated code', async () => {
      const insecureCode: CodeGenerationResult = {
        files: [
          {
            path: 'src/config.ts',
            content: 'export const secret = "my-super-secret-key";',
            action: 'create',
            explanation: 'Config with secret',
          },
        ],
        summary: 'Added config',
        confidence: 80,
        testsIncluded: false,
        estimatedComplexity: 1 as ComplexityScore,
      };
      const issue = createMockIssue();

      const result = await reviewer.reviewCode(insecureCode, issue);

      expect(result.review.securityIssues.length).toBeGreaterThan(0);
      expect(result.shouldEscalate).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return empty stats initially', async () => {
      const stats = await reviewer.getStats();

      expect(stats.total).toBe(0);
      expect(stats.approved).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.commonIssues).toEqual({});
    });

    it('should track reviews over time', async () => {
      const resolution = createMockResolution();
      const conflict = createMockConflict();

      await reviewer.review(resolution, conflict);
      await reviewer.review(resolution, conflict);

      const stats = await reviewer.getStats();

      expect(stats.total).toBe(2);
      expect(stats.approved).toBe(2);
    });
  });
});
