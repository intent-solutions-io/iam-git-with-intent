/**
 * Coder Agent Confidence Enforcement Tests
 *
 * Tests that CoderAgent rejects low-confidence code generation results
 * and respects configurable thresholds.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoderAgent } from '../index.js';
import type { ComplexityScore } from '@gwi/core';

// Mock the model chat to return controlled responses
vi.mock('@gwi/core/models', () => ({
  createModelSelector: vi.fn(() => ({
    chat: vi.fn(),
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

/**
 * Create a mock LLM response with given confidence
 */
function mockResponse(confidence: number, files = true): string {
  return JSON.stringify({
    files: files
      ? [
          {
            path: 'src/feature.ts',
            content: 'export const x = 1;',
            action: 'create',
            explanation: 'Feature implementation',
          },
        ]
      : [],
    summary: 'Test implementation',
    confidence,
    testsIncluded: false,
    estimatedComplexity: 3,
  });
}

describe('CoderAgent confidence enforcement', () => {
  describe('constructor options', () => {
    it('should use default minConfidence of 40', () => {
      const agent = new CoderAgent();
      expect(agent.minConfidence).toBe(40);
    });

    it('should accept custom minConfidence', () => {
      const agent = new CoderAgent({ minConfidence: 70 });
      expect(agent.minConfidence).toBe(70);
    });
  });

  describe('generateCode confidence gate', () => {
    let agent: CoderAgent;

    const mockIssue = {
      url: 'https://github.com/test/repo/issues/1',
      number: 1,
      title: 'Test Issue',
      body: 'Test body',
      author: 'test-user',
      labels: ['enhancement'],
      assignees: [],
      milestone: undefined,
      repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(async () => {
      agent = new CoderAgent({ minConfidence: 40 });
      await agent.initialize();
    });

    afterEach(async () => {
      await agent.shutdown();
    });

    it('should throw when confidence is below threshold', async () => {
      // Override the chat method to return low confidence
      (agent as any).chat = vi.fn(() => Promise.resolve(mockResponse(10)));

      await expect(
        agent.generateCode({
          issue: mockIssue,
          complexity: 5 as ComplexityScore,
        })
      ).rejects.toThrow('Code generation confidence too low (10%, minimum 40%)');
    });

    it('should allow confidence above threshold', async () => {
      (agent as any).chat = vi.fn(() => Promise.resolve(mockResponse(85)));

      const result = await agent.generateCode({
        issue: mockIssue,
        complexity: 5 as ComplexityScore,
      });

      expect(result.code.confidence).toBe(85);
      expect(result.code.files).toHaveLength(1);
    });

    it('should allow confidence at exactly the threshold', async () => {
      (agent as any).chat = vi.fn(() => Promise.resolve(mockResponse(40)));

      const result = await agent.generateCode({
        issue: mockIssue,
        complexity: 5 as ComplexityScore,
      });

      expect(result.code.confidence).toBe(40);
    });

    it('should allow low confidence when no files are generated', async () => {
      // Low confidence with no files should not throw (it's a valid "I cannot generate" response)
      // Note: parseResponse normalizes confidence 0 to 50 via `parsed.confidence || 50`
      (agent as any).chat = vi.fn(() => Promise.resolve(mockResponse(10, false)));

      const result = await agent.generateCode({
        issue: mockIssue,
        complexity: 5 as ComplexityScore,
      });

      // Even with low confidence, no files = no block
      expect(result.code.files).toHaveLength(0);
    });

    it('should respect custom threshold from constructor', async () => {
      const strictAgent = new CoderAgent({ minConfidence: 80 });
      await strictAgent.initialize();

      (strictAgent as any).chat = vi.fn(() => Promise.resolve(mockResponse(70)));

      await expect(
        strictAgent.generateCode({
          issue: mockIssue,
          complexity: 5 as ComplexityScore,
        })
      ).rejects.toThrow('Code generation confidence too low (70%, minimum 80%)');

      await strictAgent.shutdown();
    });
  });
});
