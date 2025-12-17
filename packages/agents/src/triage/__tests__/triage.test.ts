/**
 * Triage Agent Tests
 *
 * Phase 2: Tests for issue triage (issue-to-code workflow)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TriageAgent } from '../index.js';
import type { IssueMetadata } from '@gwi/core';


// Mock model selector with realistic triage responses
vi.mock('@gwi/core/models', () => ({
  createModelSelector: vi.fn(() => ({
    chat: vi.fn(({ messages }) => {
      // Return different responses based on input
      const userMessage = messages.find((m: { role: string }) => m.role === 'user')?.content || '';

      if (userMessage.includes('typo') || userMessage.includes('documentation')) {
        return Promise.resolve({
          content: JSON.stringify({
            overallComplexity: 2,
            fileComplexities: [{ file: 'README.md', complexity: 2, reason: 'Simple doc update' }],
            routeDecision: 'auto-resolve',
            riskLevel: 'low',
            estimatedTimeSec: 60,
            explanation: 'Simple documentation change',
          }),
          model: 'gemini-flash',
          tokensUsed: { input: 100, output: 50 },
          finishReason: 'stop',
        });
      }

      if (userMessage.includes('security') || userMessage.includes('auth')) {
        return Promise.resolve({
          content: JSON.stringify({
            overallComplexity: 8,
            fileComplexities: [{ file: 'auth.ts', complexity: 8, reason: 'Security-critical code' }],
            routeDecision: 'human-required',
            riskLevel: 'high',
            estimatedTimeSec: 3600,
            explanation: 'Security-sensitive implementation requiring expert review',
          }),
          model: 'gemini-flash',
          tokensUsed: { input: 100, output: 50 },
          finishReason: 'stop',
        });
      }

      // Default medium complexity
      return Promise.resolve({
        content: JSON.stringify({
          overallComplexity: 5,
          fileComplexities: [{ file: 'feature.ts', complexity: 5, reason: 'Standard feature' }],
          routeDecision: 'agent-resolve',
          riskLevel: 'medium',
          estimatedTimeSec: 300,
          explanation: 'Standard feature implementation',
        }),
        model: 'gemini-flash',
        tokensUsed: { input: 100, output: 50 },
        finishReason: 'stop',
      });
    }),
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

describe('TriageAgent', () => {
  let triage: TriageAgent;

  beforeEach(async () => {
    triage = new TriageAgent();
    await triage.initialize();
  });

  describe('triageIssue', () => {
    it('should triage a simple documentation issue as low complexity', async () => {
      const issue: IssueMetadata = {
        url: 'https://github.com/test/repo/issues/1',
        number: 1,
        title: 'Fix typo in documentation',
        body: 'There is a typo in the README documentation',
        author: 'contributor',
        labels: ['documentation'],
        assignees: [],
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await triage.triageIssue(issue);

      expect(result).toBeDefined();
      expect(result.overallComplexity).toBeLessThanOrEqual(3);
      expect(result.routeDecision).toBe('auto-resolve');
      expect(result.riskLevel).toBe('low');
    });

    it('should triage security-related issues as high complexity', async () => {
      const issue: IssueMetadata = {
        url: 'https://github.com/test/repo/issues/2',
        number: 2,
        title: 'Add authentication to API',
        body: 'Implement security authentication for the API endpoints',
        author: 'lead',
        labels: ['security', 'enhancement'],
        assignees: [],
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await triage.triageIssue(issue);

      expect(result).toBeDefined();
      expect(result.overallComplexity).toBeGreaterThanOrEqual(7);
      expect(result.routeDecision).toBe('human-required');
      expect(result.riskLevel).toBe('high');
    });

    it('should triage standard features as medium complexity', async () => {
      const issue: IssueMetadata = {
        url: 'https://github.com/test/repo/issues/3',
        number: 3,
        title: 'Add new API endpoint',
        body: 'Create a new endpoint to list users',
        author: 'dev',
        labels: ['enhancement'],
        assignees: [],
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await triage.triageIssue(issue);

      expect(result).toBeDefined();
      expect(result.overallComplexity).toBeGreaterThanOrEqual(4);
      expect(result.overallComplexity).toBeLessThanOrEqual(7);
      expect(result.routeDecision).toBe('agent-resolve');
      expect(result.riskLevel).toBe('medium');
    });

    it('should include file complexity estimates', async () => {
      const issue: IssueMetadata = {
        url: 'https://github.com/test/repo/issues/4',
        number: 4,
        title: 'Implement feature',
        body: 'Add the new feature',
        author: 'dev',
        labels: [],
        assignees: [],
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await triage.triageIssue(issue);

      expect(result.fileComplexities).toBeDefined();
      expect(result.fileComplexities.length).toBeGreaterThan(0);
      expect(result.fileComplexities[0]).toHaveProperty('file');
      expect(result.fileComplexities[0]).toHaveProperty('complexity');
      expect(result.fileComplexities[0]).toHaveProperty('reason');
    });

    it('should provide estimated time', async () => {
      const issue: IssueMetadata = {
        url: 'https://github.com/test/repo/issues/5',
        number: 5,
        title: 'Any issue',
        body: 'Some description',
        author: 'dev',
        labels: [],
        assignees: [],
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await triage.triageIssue(issue);

      expect(result.estimatedTimeSec).toBeDefined();
      expect(result.estimatedTimeSec).toBeGreaterThan(0);
    });
  });

  describe('output validation', () => {
    it('should always return valid complexity scores (1-10)', async () => {
      const issue: IssueMetadata = {
        url: 'https://github.com/test/repo/issues/6',
        number: 6,
        title: 'Test',
        body: 'Test',
        author: 'test',
        labels: [],
        assignees: [],
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await triage.triageIssue(issue);

      expect(result.overallComplexity).toBeGreaterThanOrEqual(1);
      expect(result.overallComplexity).toBeLessThanOrEqual(10);
    });

    it('should always return valid route decision', async () => {
      const issue: IssueMetadata = {
        url: 'https://github.com/test/repo/issues/7',
        number: 7,
        title: 'Test',
        body: 'Test',
        author: 'test',
        labels: [],
        assignees: [],
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await triage.triageIssue(issue);

      expect(['auto-resolve', 'agent-resolve', 'human-required']).toContain(result.routeDecision);
    });

    it('should always return valid risk level', async () => {
      const issue: IssueMetadata = {
        url: 'https://github.com/test/repo/issues/8',
        number: 8,
        title: 'Test',
        body: 'Test',
        author: 'test',
        labels: [],
        assignees: [],
        repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await triage.triageIssue(issue);

      expect(['low', 'medium', 'high']).toContain(result.riskLevel);
    });
  });
});
