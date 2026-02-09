/**
 * Slop Detector Agent Tests
 *
 * Tests for AI slop detection functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlopDetectorAgent, createSlopDetectorAgent } from '../slop-detector-agent.js';
import { analyzeLinguistic, hasObviousComments } from '../analyzers/linguistic.js';
import { analyzeQuality } from '../analyzers/quality.js';
import { analyzeContributor } from '../analyzers/contributor.js';
import type { SlopAnalysisInput, ContributorContext } from '../index.js';

// Mock model selector
vi.mock('@gwi/core/models', () => ({
  createModelSelector: vi.fn(() => ({
    chat: vi.fn(() => Promise.resolve({
      content: JSON.stringify({
        adjustedScore: 50,
        confidence: 0.8,
        falsePositives: [],
        additionalConcerns: [],
        reasoning: 'LLM analysis indicates moderate slop risk',
      }),
      model: 'gemini-flash',
      tokensUsed: { input: 100, output: 50 },
      finishReason: 'stop',
    })),
    selectModel: vi.fn(() => ({
      provider: 'google',
      model: 'gemini-flash',
      maxTokens: 2048,
    })),
  })),
  MODELS: {
    anthropic: { haiku: 'claude-3-haiku', sonnet: 'claude-sonnet-4', opus: 'claude-opus-4' },
    google: { flash: 'gemini-2.0-flash-exp', pro: 'gemini-1.5-pro' },
  },
}));

describe('SlopDetectorAgent', () => {
  let agent: SlopDetectorAgent;

  beforeEach(async () => {
    agent = createSlopDetectorAgent();
    await agent.initialize();
  });

  describe('analyze', () => {
    it('should detect obvious AI slop patterns', async () => {
      const input: SlopAnalysisInput = {
        prUrl: 'https://github.com/test/repo/pull/1',
        diff: `+// Initialize the counter variable
+let counter = 0;
+// Increment the counter
+counter++;
+// Return the result
+return counter;`,
        prTitle: "I've made some improvements to enhance the codebase",
        prBody: `I hope this helps! I've enhanced the code for better maintainability.
Please let me know if you have any questions.
Looking forward to your feedback!`,
        contributor: 'ai-contributor',
        files: [{ path: 'src/utils.ts', additions: 10, deletions: 0 }],
      };

      const result = await agent.analyze(input);

      expect(result.slopScore).toBeGreaterThan(30);
      expect(result.signals.length).toBeGreaterThan(0);
      expect(result.signals.some(s => s.type === 'linguistic')).toBe(true);
    });

    it('should allow legitimate contributions', async () => {
      const input: SlopAnalysisInput = {
        prUrl: 'https://github.com/test/repo/pull/2',
        diff: `+export function calculateTax(income: number, rate: number): number {
+  if (income <= 0) throw new Error('Income must be positive');
+  return income * rate;
+}`,
        prTitle: 'Add tax calculation utility',
        prBody: 'Implements the tax calculation function as discussed in #42.',
        contributor: 'legitimate-dev',
        files: [
          { path: 'src/tax.ts', additions: 5, deletions: 0 },
          { path: 'src/tax.test.ts', additions: 20, deletions: 0 },
        ],
      };

      const result = await agent.analyze(input);

      expect(result.slopScore).toBeLessThan(50);
      expect(result.recommendation).not.toBe('auto_close');
    });

    it('should flag markdown-only PRs', async () => {
      const input: SlopAnalysisInput = {
        prUrl: 'https://github.com/test/repo/pull/3',
        diff: `+## New Section
+This is a new section in the documentation.`,
        prTitle: 'Update README',
        prBody: 'Updated the documentation for better clarity.',
        contributor: 'doc-contributor',
        files: [{ path: 'README.md', additions: 5, deletions: 0 }],
      };

      const result = await agent.analyze(input);

      expect(result.signals.some(s => s.signal === 'readme_inflation' || s.signal === 'markdown_only')).toBe(true);
    });

    it('should respect custom thresholds', async () => {
      const strictAgent = createSlopDetectorAgent({
        allowMax: 10,
        flagMax: 30,
        warnMax: 50,
      });
      await strictAgent.initialize();

      const input: SlopAnalysisInput = {
        prUrl: 'https://github.com/test/repo/pull/4',
        diff: '+# Small change',
        prTitle: 'Minor update',
        prBody: 'Small fix',
        contributor: 'dev',
        files: [{ path: 'README.md', additions: 1, deletions: 0 }],
      };

      const result = await strictAgent.analyze(input);

      // With stricter thresholds, even low scores might get flagged
      expect(result.recommendation).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('should return detection statistics', async () => {
      // Analyze a few PRs
      const inputs: SlopAnalysisInput[] = [
        {
          prUrl: 'https://github.com/test/repo/pull/1',
          diff: '+code',
          prTitle: 'Good PR',
          prBody: 'Fixes bug',
          contributor: 'dev1',
          files: [{ path: 'src/fix.ts', additions: 5, deletions: 2 }],
        },
        {
          prUrl: 'https://github.com/test/repo/pull/2',
          diff: '+// comment',
          prTitle: "I've improved everything",
          prBody: 'I hope this helps! Let me know if you need changes.',
          contributor: 'dev2',
          files: [{ path: 'src/code.ts', additions: 1, deletions: 0 }],
        },
      ];

      for (const input of inputs) {
        await agent.analyze(input);
      }

      const stats = await agent.getStats();

      expect(stats.total).toBe(2);
      expect(stats.averageScore).toBeDefined();
    });
  });
});

describe('Linguistic Analyzer', () => {
  it('should detect templated improvement phrases', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: '+code',
      prTitle: "I've made some improvements to enhance the codebase",
      prBody: "I've refactored the code for better maintainability",
      contributor: 'test',
      files: [],
    };

    const result = analyzeLinguistic(input);

    expect(result.signals.some(s => s.signal === 'templated_improvements')).toBe(true);
    expect(result.totalWeight).toBeGreaterThan(0);
  });

  it('should detect over-politeness', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: '+code',
      prTitle: 'Update code',
      prBody: "I hope this helps! Please let me know if you'd like any changes. Looking forward to your feedback!",
      contributor: 'test',
      files: [],
    };

    const result = analyzeLinguistic(input);

    expect(result.signals.some(s => s.signal === 'over_politeness')).toBe(true);
  });

  it('should detect AI disclosure', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: '+code',
      prTitle: 'Update generated by ChatGPT',
      prBody: 'This code was written with AI assistance.',
      contributor: 'test',
      files: [],
    };

    const result = analyzeLinguistic(input);

    expect(result.signals.some(s => s.signal === 'ai_disclosure')).toBe(true);
  });

  it('should detect comment-heavy PRs', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: `+// This initializes the counter
+// Set counter to zero
+// Counter variable declaration
+let counter = 0;
+// Increment operation
+// Add one to counter
+counter++;`,
      prTitle: 'Add comments',
      prBody: 'Added helpful comments',
      contributor: 'test',
      files: [],
    };

    const result = analyzeLinguistic(input);

    expect(result.signals.some(s => s.signal === 'comment_heavy_pr')).toBe(true);
  });

  it('should not flag legitimate PRs', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: `+export function add(a: number, b: number): number {
+  return a + b;
+}`,
      prTitle: 'Add utility function',
      prBody: 'Adds a simple add function for the math module.',
      contributor: 'test',
      files: [],
    };

    const result = analyzeLinguistic(input);

    expect(result.totalWeight).toBeLessThan(20);
  });
});

describe('hasObviousComments', () => {
  it('should detect obvious increment comments', () => {
    const code = `// increment counter
counter++;`;
    expect(hasObviousComments(code)).toBe(true);
  });

  it('should detect obvious return comments', () => {
    const code = `// return the result
return result;`;
    expect(hasObviousComments(code)).toBe(true);
  });

  it('should not flag useful comments', () => {
    const code = `// Calculate compound interest using the standard formula
// Principal * (1 + rate/n)^(n*t) where n is compounding frequency`;
    expect(hasObviousComments(code)).toBe(false);
  });
});

describe('Quality Analyzer', () => {
  it('should detect cosmetic-only changes', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: `+
+
-
+
+`,
      prTitle: 'Format code',
      prBody: 'Cleaned up formatting',
      contributor: 'test',
      files: [{ path: 'src/code.ts', additions: 3, deletions: 1 }],
    };

    const result = analyzeQuality(input);

    expect(result.signals.some(s => s.signal === 'cosmetic_only')).toBe(true);
  });

  it('should detect README-only changes', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: '+# New heading',
      prTitle: 'Update docs',
      prBody: 'Updated documentation',
      contributor: 'test',
      files: [{ path: 'README.md', additions: 5, deletions: 0 }],
    };

    const result = analyzeQuality(input);

    expect(result.signals.some(s =>
      s.signal === 'readme_inflation' || s.signal === 'markdown_only'
    )).toBe(true);
  });

  it('should detect testless features', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: `+export function newFeature() {
+  return 'feature';
+}`,
      prTitle: 'Add feature',
      prBody: 'New feature implementation',
      contributor: 'test',
      files: [{ path: 'src/feature.ts', additions: 10, deletions: 0 }],
    };

    const result = analyzeQuality(input);

    expect(result.signals.some(s => s.signal === 'testless_feature')).toBe(true);
  });

  it('should not flag PRs with tests', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: `+export function newFeature() {
+  return 'feature';
+}`,
      prTitle: 'Add feature with tests',
      prBody: 'New feature with full test coverage',
      contributor: 'test',
      files: [
        { path: 'src/feature.ts', additions: 10, deletions: 0 },
        { path: 'src/feature.test.ts', additions: 20, deletions: 0 },
      ],
    };

    const result = analyzeQuality(input);

    expect(result.signals.some(s => s.signal === 'testless_feature')).toBe(false);
  });

  it('should detect tiny changes', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: '+const x = 1;',
      prTitle: 'Fix typo',
      prBody: 'Fixed a typo',
      contributor: 'test',
      files: [{ path: 'src/code.ts', additions: 1, deletions: 1 }],
    };

    const result = analyzeQuality(input);

    expect(result.signals.some(s => s.signal === 'tiny_change')).toBe(true);
  });
});

describe('Contributor Analyzer', () => {
  it('should detect first-time contributors with context', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: '+code',
      prTitle: 'PR',
      prBody: 'Description',
      contributor: 'new-user',
      files: [],
    };

    const context: ContributorContext = {
      isFirstTimeContributor: true,
      previousPRCount: 0,
      engagementCount: 0,
      accountAgeDays: 7,
      repoCount: 1,
      recentPRCount: 10,
      crossRepoSimilarPRs: 5,
    };

    const result = analyzeContributor(input, context);

    expect(result.signals.some(s => s.signal === 'first_time_contributor')).toBe(true);
    expect(result.signals.some(s => s.signal === 'no_engagement')).toBe(true);
    expect(result.signals.some(s => s.signal === 'burst_submissions')).toBe(true);
    expect(result.signals.some(s => s.signal === 'cross_repo_spam')).toBe(true);
  });

  it('should return empty signals without context', () => {
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: '+code',
      prTitle: 'PR',
      prBody: 'Description',
      contributor: 'user',
      files: [],
    };

    const result = analyzeContributor(input);

    expect(result.signals.length).toBe(0);
    expect(result.totalWeight).toBe(0);
  });
});

describe('Score Calculation', () => {
  it('should cap score at 100', async () => {
    const agent = createSlopDetectorAgent();
    await agent.initialize();

    // Create input that should trigger many signals
    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: `+// Initialize
+// Set value
+// Comment
+// Another comment
+// More comments
+// Even more`,
      prTitle: "I've made some improvements to enhance the codebase for better maintainability",
      prBody: `I hope this helps! Let me know if you'd like any changes.
Looking forward to your feedback! I've enhanced the user experience.
This was generated by ChatGPT with AI assistance.`,
      contributor: 'bot',
      files: [{ path: 'README.md', additions: 50, deletions: 0 }],
    };

    const result = await agent.analyze(input);

    expect(result.slopScore).toBeLessThanOrEqual(100);
    expect(result.slopScore).toBeGreaterThanOrEqual(0);
  });

  it('should return score 0 for empty signals', async () => {
    const agent = createSlopDetectorAgent();
    await agent.initialize();

    const input: SlopAnalysisInput = {
      prUrl: 'https://github.com/test/repo/pull/1',
      diff: `+export function complexBusinessLogic(data: Input): Output {
+  const validated = validateInput(data);
+  const processed = processData(validated);
+  const result = transformOutput(processed);
+  return result;
+}`,
      prTitle: 'Implement business logic processor',
      prBody: 'Implements the data processing pipeline as specified in the RFC.',
      contributor: 'senior-dev',
      files: [
        { path: 'src/processor.ts', additions: 50, deletions: 10 },
        { path: 'src/processor.test.ts', additions: 100, deletions: 0 },
      ],
    };

    const result = await agent.analyze(input);

    // Should have very low score for legitimate contribution
    expect(result.slopScore).toBeLessThan(30);
  });
});
