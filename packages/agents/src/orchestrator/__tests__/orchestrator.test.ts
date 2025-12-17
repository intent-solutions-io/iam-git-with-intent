/**
 * Orchestrator Agent Tests
 *
 * Phase 2: Minimal E2E tests for the orchestrator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrchestratorAgent } from '../index.js';

// Mock model selector to avoid real API calls
vi.mock('@gwi/core/models', () => ({
  createModelSelector: vi.fn(() => ({
    chat: vi.fn(({ messages }) => {
      // Return format depends on what's being asked
      const userMessage = messages?.find((m: { role: string }) => m.role === 'user')?.content || '';

      // autoRoute expects workflowType and priority
      if (userMessage.includes('Route this request')) {
        return Promise.resolve({
          content: '{"workflowType": "pr-resolve", "priority": 2, "specialHandling": null}',
          model: 'gemini-flash',
          tokensUsed: { input: 100, output: 50 },
          finishReason: 'stop',
        });
      }

      // Default triage response
      return Promise.resolve({
        content: '{"overallComplexity": 5, "routeDecision": "agent-resolve", "riskLevel": "medium"}',
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
    anthropic: {
      haiku: 'claude-3-haiku',
      sonnet: 'claude-sonnet-4',
      opus: 'claude-opus-4',
    },
    google: {
      flash: 'gemini-2.0-flash-exp',
      pro: 'gemini-1.5-pro',
    },
  },
}));

describe('OrchestratorAgent', () => {
  let orchestrator: OrchestratorAgent;

  beforeEach(async () => {
    orchestrator = new OrchestratorAgent();
    await orchestrator.initialize();
  });

  describe('Workflow Definitions', () => {
    it('should have issue-to-code workflow defined', async () => {
      const registry = await orchestrator.getAgentRegistry();
      expect(registry).toBeDefined();
      expect(registry.length).toBeGreaterThan(0);

      // Check that required agents are registered
      const agentNames = registry.map(a => a.name);
      expect(agentNames).toContain('triage');
      expect(agentNames).toContain('coder');
      expect(agentNames).toContain('reviewer');
    });

    it('should have pr-resolve workflow defined', async () => {
      const registry = await orchestrator.getAgentRegistry();
      const agentNames = registry.map(a => a.name);

      // PR resolve needs triage, resolver, reviewer
      expect(agentNames).toContain('triage');
      expect(agentNames).toContain('resolver');
      expect(agentNames).toContain('reviewer');
    });
  });

  describe('startWorkflow', () => {
    it('should reject unknown workflow types', async () => {
      await expect(
        orchestrator.startWorkflow('unknown-workflow' as any, {})
      ).rejects.toThrow('Unknown workflow type');
    });

    it('should create a workflow with correct initial state', async () => {
      // Start a workflow but expect it to start executing
      // This will fail at agent execution but proves the workflow is created
      try {
        await orchestrator.startWorkflow('issue-to-code', {
          issue: {
            url: 'https://github.com/test/repo/issues/1',
            number: 1,
            title: 'Test issue',
            body: 'Test body',
            author: 'test',
            labels: [],
            assignees: [],
            repo: { owner: 'test', name: 'repo', fullName: 'test/repo' },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          targetBranch: 'main',
        });
      } catch {
        // Expected to fail at agent execution in mock environment
      }

      // Check that workflow was tracked
      const workflows = await orchestrator.listWorkflows();
      expect(workflows.length).toBeGreaterThan(0);

      const workflow = workflows[0];
      expect(workflow.type).toBe('issue-to-code');
      expect(workflow.steps.length).toBe(3); // triage, coder, reviewer
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return null for non-existent workflow', async () => {
      const status = await orchestrator.getWorkflowStatus('non-existent');
      expect(status).toBeNull();
    });
  });

  describe('autoRoute', () => {
    it('should route PR-related requests correctly', async () => {
      const result = await orchestrator.autoRoute('Fix merge conflict in package.json');
      expect(result).toBeDefined();
      expect(result.workflowType).toBeDefined();
      expect(result.priority).toBeDefined();
    });
  });
});
