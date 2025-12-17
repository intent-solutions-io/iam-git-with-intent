/**
 * Signals Tests
 *
 * Phase 14: Tests for signal processing, scoring determinism,
 * deduplication, and work item type inference.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  generateDedupeKey,
  inferWorkItemType,
  getSignalSourceFromEvent,
  extractGitHubContext,
  createCandidateIntentReceipt,
  assessCandidateRisk,
} from '../index.js';
import type {
  SignalSource,
  SignalContext,
  WorkItemType,
  WorkItem,
  CandidatePlan,
} from '../../storage/interfaces.js';

// =============================================================================
// Scoring Determinism Tests
// =============================================================================

describe('calculateScore', () => {
  it('is deterministic - same input produces same output', () => {
    const source: SignalSource = 'github_issue';
    const type: WorkItemType = 'issue_to_code';
    const context: SignalContext = {
      repo: { owner: 'test', name: 'repo', fullName: 'test/repo', id: 123 },
      resourceType: 'issue',
      resourceNumber: 123,
      title: 'Fix authentication bug',
      labels: ['bug'],
      actor: 'testuser',
    };

    // Run multiple times
    const results = Array.from({ length: 10 }, () =>
      calculateScore(source, type, context)
    );

    // All results should be identical
    const firstResult = results[0];
    for (const result of results) {
      expect(result.finalScore).toBe(firstResult.finalScore);
      expect(result.baseScore).toBe(firstResult.baseScore);
      expect(result.modifiers).toEqual(firstResult.modifiers);
    }
  });

  it('returns score in valid range (0-100)', () => {
    // Test with minimal context
    const minResult = calculateScore('github_issue', 'issue_to_code', {
      resourceType: 'issue',
      title: 'Simple task',
    });
    expect(minResult.finalScore).toBeGreaterThanOrEqual(0);
    expect(minResult.finalScore).toBeLessThanOrEqual(100);

    // Test with security keywords
    const maxResult = calculateScore('manual', 'pr_review', {
      resourceType: 'pr',
      title: 'Critical security vulnerability fix',
    });
    expect(maxResult.finalScore).toBeGreaterThanOrEqual(0);
    expect(maxResult.finalScore).toBeLessThanOrEqual(100);
  });

  describe('base scores by source', () => {
    const baseContext: SignalContext = {
      resourceType: 'issue',
      title: 'Test',
    };

    it('github_issue has base score of 50', () => {
      const result = calculateScore('github_issue', 'issue_to_code', baseContext);
      expect(result.baseScore).toBe(50);
    });

    it('github_pr has base score of 60', () => {
      const result = calculateScore('github_pr', 'pr_review', {
        ...baseContext,
        resourceType: 'pr',
      });
      expect(result.baseScore).toBe(60);
    });

    it('manual has base score of 70', () => {
      const result = calculateScore('manual', 'custom', baseContext);
      expect(result.baseScore).toBe(70);
    });

    it('webhook has base score of 40', () => {
      const result = calculateScore('webhook', 'custom', baseContext);
      expect(result.baseScore).toBe(40);
    });

    it('scheduled has base score of 45', () => {
      const result = calculateScore('scheduled', 'custom', baseContext);
      expect(result.baseScore).toBe(45);
    });
  });

  describe('score modifiers', () => {
    it('applies priority label modifier', () => {
      const context: SignalContext = {
        resourceType: 'issue',
        title: 'Test',
        labels: ['priority-high'],
      };
      const result = calculateScore('github_issue', 'issue_to_code', context, {
        priorityLabels: ['priority-high'],
      });

      const priorityMod = result.modifiers.find(m => m.name === 'priority_label');
      expect(priorityMod).toBeDefined();
      expect(priorityMod!.value).toBe(15);
    });

    it('applies urgent label modifier', () => {
      const context: SignalContext = {
        resourceType: 'issue',
        title: 'Test',
        labels: ['urgent'],
      };
      const result = calculateScore('github_issue', 'issue_to_code', context, {
        urgentLabels: ['urgent'],
      });

      const urgentMod = result.modifiers.find(m => m.name === 'urgent_label');
      expect(urgentMod).toBeDefined();
      expect(urgentMod!.value).toBe(25);
    });

    it('applies low priority label modifier', () => {
      const context: SignalContext = {
        resourceType: 'issue',
        title: 'Test',
        labels: ['low-priority'],
      };
      const result = calculateScore('github_issue', 'issue_to_code', context, {
        lowPriorityLabels: ['low-priority'],
      });

      const lowMod = result.modifiers.find(m => m.name === 'low_priority_label');
      expect(lowMod).toBeDefined();
      expect(lowMod!.value).toBe(-20);
    });

    it('applies bug label modifier', () => {
      const context: SignalContext = {
        resourceType: 'issue',
        title: 'Test',
        labels: ['bug'],
      };
      // tenantPolicy must be passed (even empty) for label processing to occur
      const result = calculateScore('github_issue', 'issue_to_code', context, {});

      const bugMod = result.modifiers.find(m => m.name === 'bug_label');
      expect(bugMod).toBeDefined();
      expect(bugMod!.value).toBe(10);
    });

    it('applies security keyword modifier from title', () => {
      const context: SignalContext = {
        resourceType: 'issue',
        title: 'Fix security vulnerability in auth',
        labels: [],
      };
      const result = calculateScore('github_issue', 'issue_to_code', context);

      const secMod = result.modifiers.find(m => m.name === 'security_keyword');
      expect(secMod).toBeDefined();
      expect(secMod!.value).toBe(20);
    });

    it('clamps final score to 0-100 range', () => {
      // Many positive modifiers
      const highContext: SignalContext = {
        resourceType: 'issue',
        title: 'Critical security vulnerability',
        labels: ['urgent', 'security', 'priority-high', 'bug'],
      };
      const highResult = calculateScore('manual', 'issue_to_code', highContext, {
        priorityLabels: ['priority-high'],
        urgentLabels: ['urgent'],
      });
      expect(highResult.finalScore).toBeLessThanOrEqual(100);
      expect(highResult.finalScore).toBeGreaterThanOrEqual(0);

      // Low priority context
      const lowContext: SignalContext = {
        resourceType: 'issue',
        title: 'Minor docs update',
        labels: ['low-priority'],
      };
      const lowResult = calculateScore('scheduled', 'docs_update', lowContext, {
        lowPriorityLabels: ['low-priority'],
      });
      expect(lowResult.finalScore).toBeGreaterThanOrEqual(0);
      expect(lowResult.finalScore).toBeLessThanOrEqual(100);
    });
  });

  describe('score breakdown integrity', () => {
    it('includes explanation in breakdown', () => {
      const context: SignalContext = {
        resourceType: 'issue',
        title: 'Security fix',
        labels: ['bug'],
      };
      const result = calculateScore('github_issue', 'issue_to_code', context);

      expect(result.explanation).toBeDefined();
      expect(typeof result.explanation).toBe('string');
      expect(result.explanation.length).toBeGreaterThan(0);
    });

    it('each modifier has name, value, and reason', () => {
      const context: SignalContext = {
        resourceType: 'issue',
        title: 'Test',
        labels: ['bug'],
      };
      const result = calculateScore('github_issue', 'issue_to_code', context);

      for (const mod of result.modifiers) {
        expect(mod).toHaveProperty('name');
        expect(mod).toHaveProperty('value');
        expect(mod).toHaveProperty('reason');
        expect(typeof mod.name).toBe('string');
        expect(typeof mod.value).toBe('number');
        expect(typeof mod.reason).toBe('string');
      }
    });
  });
});

// =============================================================================
// Deduplication Tests
// =============================================================================

describe('generateDedupeKey', () => {
  it('generates deterministic keys', () => {
    const context: SignalContext = {
      repo: { owner: 'owner', name: 'repo', fullName: 'owner/repo', id: 1 },
      resourceType: 'issue',
      resourceNumber: 123,
      title: 'Fix bug',
    };

    const key1 = generateDedupeKey('tenant-1', context);
    const key2 = generateDedupeKey('tenant-1', context);
    expect(key1).toBe(key2);
  });

  it('includes tenant ID in key', () => {
    const context: SignalContext = {
      repo: { owner: 'owner', name: 'repo', fullName: 'owner/repo', id: 1 },
      resourceType: 'issue',
      resourceNumber: 123,
      title: 'Fix bug',
    };

    const key1 = generateDedupeKey('tenant-1', context);
    const key2 = generateDedupeKey('tenant-2', context);
    expect(key1).not.toBe(key2);
    expect(key1).toContain('tenant-1');
    expect(key2).toContain('tenant-2');
  });

  it('includes repo in key when present', () => {
    const context1: SignalContext = {
      repo: { owner: 'owner', name: 'repo1', fullName: 'owner/repo1', id: 1 },
      resourceType: 'issue',
      resourceNumber: 123,
      title: 'Fix bug',
    };
    const context2: SignalContext = {
      repo: { owner: 'owner', name: 'repo2', fullName: 'owner/repo2', id: 2 },
      resourceType: 'issue',
      resourceNumber: 123,
      title: 'Fix bug',
    };

    const key1 = generateDedupeKey('tenant-1', context1);
    const key2 = generateDedupeKey('tenant-1', context2);
    expect(key1).not.toBe(key2);
    expect(key1).toContain('owner/repo1');
    expect(key2).toContain('owner/repo2');
  });

  it('includes resource type and number in key', () => {
    const contextIssue: SignalContext = {
      repo: { owner: 'owner', name: 'repo', fullName: 'owner/repo', id: 1 },
      resourceType: 'issue',
      resourceNumber: 123,
      title: 'Fix bug',
    };
    const contextPR: SignalContext = {
      repo: { owner: 'owner', name: 'repo', fullName: 'owner/repo', id: 1 },
      resourceType: 'pr',
      resourceNumber: 123,
      title: 'Fix bug',
    };

    const keyIssue = generateDedupeKey('tenant-1', contextIssue);
    const keyPR = generateDedupeKey('tenant-1', contextPR);
    expect(keyIssue).not.toBe(keyPR);
    expect(keyIssue).toContain('issue');
    expect(keyPR).toContain('pr');
  });

  it('uses title hash when no resource number', () => {
    const context1: SignalContext = {
      resourceType: 'comment',
      title: 'Update README',
    };
    const context2: SignalContext = {
      resourceType: 'comment',
      title: 'Fix tests',
    };

    const key1 = generateDedupeKey('tenant-1', context1);
    const key2 = generateDedupeKey('tenant-1', context2);
    expect(key1).not.toBe(key2);
  });

  it('generates same key for same title (title hash stability)', () => {
    const context: SignalContext = {
      resourceType: 'comment',
      title: 'Manual task',
    };

    // Multiple invocations should produce same key
    const keys = Array.from({ length: 5 }, () =>
      generateDedupeKey('tenant-1', context)
    );

    expect(new Set(keys).size).toBe(1);
  });
});

// =============================================================================
// Work Item Type Inference Tests
// =============================================================================

describe('inferWorkItemType', () => {
  it('infers pr_review type from github_pr source', () => {
    const result = inferWorkItemType('github_pr', { resourceType: 'pr' } as SignalContext);
    expect(result).toBe('pr_review');
  });

  it('infers pr_resolve when PR has conflict label', () => {
    const result = inferWorkItemType('github_pr', {
      resourceType: 'pr',
      labels: ['conflict', 'merge-conflict'],
    } as SignalContext);
    expect(result).toBe('pr_resolve');
  });

  it('infers issue_to_code type from issue source', () => {
    const result = inferWorkItemType('github_issue', { resourceType: 'issue' } as SignalContext);
    expect(result).toBe('issue_to_code');
  });

  it('infers docs_update when issue has docs label', () => {
    const result = inferWorkItemType('github_issue', {
      resourceType: 'issue',
      labels: ['docs'],
    } as SignalContext);
    expect(result).toBe('docs_update');
  });

  it('infers test_gen when issue has test label', () => {
    const result = inferWorkItemType('github_issue', {
      resourceType: 'issue',
      labels: ['test', 'tests'],
    } as SignalContext);
    expect(result).toBe('test_gen');
  });

  it('infers custom type for unknown sources', () => {
    const result = inferWorkItemType('webhook', {} as SignalContext);
    expect(result).toBe('custom');
  });
});

// =============================================================================
// Signal Source Detection Tests
// =============================================================================

describe('getSignalSourceFromEvent', () => {
  it('maps issues event to github_issue', () => {
    expect(getSignalSourceFromEvent('issues')).toBe('github_issue');
  });

  it('maps pull_request event to github_pr', () => {
    expect(getSignalSourceFromEvent('pull_request')).toBe('github_pr');
  });

  it('maps pull_request_review event to github_pr', () => {
    expect(getSignalSourceFromEvent('pull_request_review')).toBe('github_pr');
  });

  it('maps issue_comment event to github_comment', () => {
    expect(getSignalSourceFromEvent('issue_comment')).toBe('github_comment');
  });

  it('maps unknown events to webhook', () => {
    expect(getSignalSourceFromEvent('unknown_event')).toBe('webhook');
    expect(getSignalSourceFromEvent('push')).toBe('webhook');
  });
});

// =============================================================================
// GitHub Context Extraction Tests
// =============================================================================

describe('extractGitHubContext', () => {
  it('extracts repository context', () => {
    const payload = {
      repository: {
        full_name: 'owner/repo',
        id: 123,
      },
      sender: {
        login: 'testuser',
      },
    };

    const context = extractGitHubContext('issues', payload);

    expect(context.repo?.fullName).toBe('owner/repo');
    expect(context.repo?.owner).toBe('owner');
    expect(context.repo?.name).toBe('repo');
    expect(context.actor).toBe('testuser');
  });

  it('extracts issue context', () => {
    const payload = {
      action: 'opened',
      issue: {
        number: 42,
        title: 'Test Issue',
        body: 'Issue body text',
        html_url: 'https://github.com/owner/repo/issues/42',
        labels: [{ name: 'bug' }, { name: 'priority-high' }],
      },
      repository: {
        full_name: 'owner/repo',
        id: 123,
      },
    };

    const context = extractGitHubContext('issues', payload);

    expect(context.resourceType).toBe('issue');
    expect(context.resourceNumber).toBe(42);
    expect(context.title).toBe('Test Issue');
    expect(context.body).toBe('Issue body text');
    expect(context.resourceUrl).toBe('https://github.com/owner/repo/issues/42');
    expect(context.labels).toContain('bug');
    expect(context.labels).toContain('priority-high');
  });

  it('extracts PR context', () => {
    const payload = {
      action: 'opened',
      pull_request: {
        number: 123,
        title: 'Test PR',
        body: 'PR description',
        html_url: 'https://github.com/owner/repo/pull/123',
        labels: [{ name: 'enhancement' }],
      },
      repository: {
        full_name: 'owner/repo',
        id: 123,
      },
    };

    const context = extractGitHubContext('pull_request', payload);

    expect(context.resourceType).toBe('pr');
    expect(context.resourceNumber).toBe(123);
    expect(context.title).toBe('Test PR');
    expect(context.labels).toContain('enhancement');
  });

  it('extracts action from payload', () => {
    const payload = {
      action: 'labeled',
      repository: {
        full_name: 'owner/repo',
        id: 123,
      },
    };

    const context = extractGitHubContext('issues', payload);
    expect(context.action).toBe('labeled');
  });
});

// =============================================================================
// Intent Receipt Tests
// =============================================================================

describe('createCandidateIntentReceipt', () => {
  const mockWorkItem: WorkItem = {
    id: 'wi-123',
    tenantId: 'tenant-1',
    type: 'issue_to_code',
    title: 'Fix authentication bug',
    summary: 'Users cannot log in due to token validation issue',
    status: 'queued',
    dedupeKey: 'tenant-1:owner/repo:issue:123',
    score: 75,
    scoreBreakdown: {
      baseScore: 50,
      modifiers: [
        { name: 'bug_label', value: 10, reason: 'Has bug label' },
        { name: 'security_keyword', value: 15, reason: 'Contains security keyword' },
      ],
      finalScore: 75,
      explanation: 'Base: 50. +10: Has bug label; +15: Contains security keyword. Final: 75',
    },
    signalIds: ['sig-1'],
    evidence: {
      sourceUrls: ['https://github.com/owner/repo/issues/123'],
    },
    repo: { owner: 'owner', name: 'repo', fullName: 'owner/repo', id: 1 },
    resourceNumber: 123,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPlan: CandidatePlan = {
    summary: 'Fix token validation in auth middleware',
    approach: 'Update the JWT validation logic to handle edge cases',
    affectedFiles: ['src/auth/middleware.ts', 'src/auth/middleware.test.ts'],
    complexity: 3,
  };

  it('creates receipt with required fields', () => {
    const receipt = createCandidateIntentReceipt(mockWorkItem, mockPlan, 'agent:coder');

    expect(receipt.intent).toBeDefined();
    expect(receipt.changeSummary).toBeDefined();
    expect(receipt.actor).toBe('agent:coder');
    expect(receipt.when).toBeDefined();
    expect(receipt.scope).toBeDefined();
    expect(receipt.evidence).toBeDefined();
  });

  it('includes work item info in intent', () => {
    const receipt = createCandidateIntentReceipt(mockWorkItem, mockPlan, 'agent:coder');

    expect(receipt.intent).toContain('issue to code');
    expect(receipt.intent).toContain('Fix authentication bug');
    expect(receipt.changeSummary).toBe('Fix token validation in auth middleware');
  });

  it('includes scope from work item', () => {
    const receipt = createCandidateIntentReceipt(mockWorkItem, mockPlan, 'agent:coder');

    expect(receipt.scope).toContain('owner/repo');
    expect(receipt.scope).toContain('#123');
  });

  it('includes score in evidence', () => {
    const receipt = createCandidateIntentReceipt(mockWorkItem, mockPlan, 'agent:coder');

    expect(receipt.evidence).toContain('75/100');
  });
});

// =============================================================================
// Risk Assessment Tests
// =============================================================================

describe('assessCandidateRisk', () => {
  const mockWorkItem: WorkItem = {
    id: 'wi-123',
    tenantId: 'tenant-1',
    type: 'issue_to_code',
    title: 'Test',
    summary: 'Test summary',
    status: 'queued',
    dedupeKey: 'test',
    score: 50,
    scoreBreakdown: { baseScore: 50, modifiers: [], finalScore: 50, explanation: 'Base: 50' },
    signalIds: [],
    evidence: { sourceUrls: [] },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('assesses low risk for simple changes', () => {
    const plan: CandidatePlan = {
      summary: 'Simple fix',
      approach: 'Direct fix',
      affectedFiles: ['src/utils.ts'],
      complexity: 1,
    };

    const risk = assessCandidateRisk(plan, mockWorkItem);

    expect(risk.level).toBe('low');
    expect(risk.score).toBeLessThan(25);
  });

  it('assesses higher risk for security file changes', () => {
    const plan: CandidatePlan = {
      summary: 'Auth update',
      approach: 'Update authentication',
      affectedFiles: ['src/auth/login.ts', 'src/auth/credentials.ts'],
      complexity: 3,
    };

    const risk = assessCandidateRisk(plan, mockWorkItem);

    expect(['medium', 'high', 'critical']).toContain(risk.level);
    expect(risk.factors.some(f => f.name === 'security_files')).toBe(true);
  });

  it('assesses higher risk for many files', () => {
    const plan: CandidatePlan = {
      summary: 'Large refactor',
      approach: 'Refactor module',
      affectedFiles: Array.from({ length: 12 }, (_, i) => `src/file${i}.ts`),
      complexity: 2,
    };

    const risk = assessCandidateRisk(plan, mockWorkItem);

    expect(['medium', 'high', 'critical']).toContain(risk.level);
    expect(risk.factors.some(f => f.name === 'large_change')).toBe(true);
  });

  it('assesses higher risk for high complexity', () => {
    const plan: CandidatePlan = {
      summary: 'Complex change',
      approach: 'Complex approach',
      affectedFiles: ['src/core.ts'],
      complexity: 5,
    };

    const risk = assessCandidateRisk(plan, mockWorkItem);

    expect(['medium', 'high', 'critical']).toContain(risk.level);
    expect(risk.factors.some(f => f.name === 'high_complexity')).toBe(true);
  });

  it('assesses risk for config file changes', () => {
    const plan: CandidatePlan = {
      summary: 'Config update',
      approach: 'Update config',
      affectedFiles: ['config.json', 'settings.yaml', '.env'],
      complexity: 1,
    };

    const risk = assessCandidateRisk(plan, mockWorkItem);

    expect(risk.factors.some(f => f.name === 'config_files')).toBe(true);
  });

  it('provides mitigations for risky changes', () => {
    const plan: CandidatePlan = {
      summary: 'Security update',
      approach: 'Update security',
      affectedFiles: ['src/auth/security.ts'],
      complexity: 4,
    };

    const risk = assessCandidateRisk(plan, mockWorkItem);

    expect(risk.mitigations).toBeDefined();
    expect(risk.mitigations!.length).toBeGreaterThan(0);
  });

  it('returns score in valid range', () => {
    const plans = [
      { summary: 'A', approach: 'A', affectedFiles: ['a.ts'], complexity: 1 },
      { summary: 'B', approach: 'B', affectedFiles: Array.from({ length: 15 }, (_, i) => `f${i}.ts`), complexity: 5 },
    ];

    for (const plan of plans) {
      const risk = assessCandidateRisk(plan, mockWorkItem);
      expect(risk.score).toBeGreaterThanOrEqual(0);
      expect(risk.score).toBeLessThanOrEqual(100);
    }
  });
});
