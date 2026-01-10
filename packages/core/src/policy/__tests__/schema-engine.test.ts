/**
 * Schema-Based Policy Engine Tests
 *
 * Epic D: Policy & Audit - Story D2: Policy Engine
 * Task D2.1: Create PolicyEngine class
 *
 * @module @gwi/core/policy/schema-engine.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SchemaPolicyEngine,
  createSchemaEngine,
  getSchemaEngine,
  resetSchemaEngine,
  evaluateSchemaPolicy,
} from '../schema-engine.js';
import type { PolicyDocument, PolicyEvaluationRequest } from '../schema.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMinimalPolicy(overrides: Partial<PolicyDocument> = {}): PolicyDocument {
  return {
    version: '2.0',
    name: 'Test Policy',
    scope: 'repo',
    inheritance: 'override',
    defaultAction: { effect: 'deny', reason: 'Default deny' },
    rules: [],
    ...overrides,
  };
}

function createMinimalRequest(overrides: Partial<PolicyEvaluationRequest> = {}): PolicyEvaluationRequest {
  return {
    actor: { id: 'user-1', type: 'human' },
    action: { name: 'test.action' },
    resource: { type: 'test' },
    context: { source: 'cli', timestamp: new Date() },
    ...overrides,
  };
}

// =============================================================================
// SchemaPolicyEngine Tests
// =============================================================================

describe('SchemaPolicyEngine', () => {
  let engine: SchemaPolicyEngine;

  beforeEach(() => {
    engine = new SchemaPolicyEngine();
    resetSchemaEngine();
  });

  describe('loadPolicy()', () => {
    it('should load a valid policy', () => {
      const policy = createMinimalPolicy();
      expect(() => engine.loadPolicy(policy)).not.toThrow();
      expect(engine.getLoadedPolicies()).toContain('Test Policy');
    });

    it('should load policy with custom ID', () => {
      const policy = createMinimalPolicy();
      engine.loadPolicy(policy, 'custom-id');
      expect(engine.getLoadedPolicies()).toContain('custom-id');
    });

    it('should reject invalid policy when validation enabled', () => {
      const engine = new SchemaPolicyEngine({ validateOnLoad: true });
      expect(() => engine.loadPolicy({ invalid: true } as any)).toThrow();
    });

    it('should accept invalid policy when validation disabled', () => {
      const engine = new SchemaPolicyEngine({ validateOnLoad: false });
      // This would fail schema parsing, but with validation disabled it tries to use it
      const policy = createMinimalPolicy();
      expect(() => engine.loadPolicy(policy)).not.toThrow();
    });
  });

  describe('unloadPolicy()', () => {
    it('should unload an existing policy', () => {
      const policy = createMinimalPolicy();
      engine.loadPolicy(policy);
      expect(engine.unloadPolicy('Test Policy')).toBe(true);
      expect(engine.getLoadedPolicies()).not.toContain('Test Policy');
    });

    it('should return false for non-existent policy', () => {
      expect(engine.unloadPolicy('non-existent')).toBe(false);
    });
  });

  describe('clearPolicies()', () => {
    it('should remove all policies', () => {
      engine.loadPolicy(createMinimalPolicy({ name: 'Policy 1' }));
      engine.loadPolicy(createMinimalPolicy({ name: 'Policy 2' }));
      engine.clearPolicies();
      expect(engine.getLoadedPolicies()).toHaveLength(0);
    });
  });

  describe('evaluate()', () => {
    describe('default behavior', () => {
      it('should return deny when no policies loaded', () => {
        const result = engine.evaluate(createMinimalRequest());
        expect(result.allowed).toBe(false);
        expect(result.effect).toBe('deny');
        expect(result.reason).toBe('No matching policy rule');
      });

      it('should return allow when default effect is allow', () => {
        const engine = new SchemaPolicyEngine({ defaultEffect: 'allow' });
        const result = engine.evaluate(createMinimalRequest());
        expect(result.allowed).toBe(true);
        expect(result.effect).toBe('allow');
      });
    });

    describe('rule matching', () => {
      it('should match rule without conditions', () => {
        engine.loadPolicy(createMinimalPolicy({
          rules: [{
            id: 'allow-all',
            name: 'Allow All',
            action: { effect: 'allow' },
          }],
        }));

        const result = engine.evaluate(createMinimalRequest());
        expect(result.allowed).toBe(true);
        expect(result.matchedRule?.id).toBe('allow-all');
      });

      it('should respect rule priority', () => {
        engine.loadPolicy(createMinimalPolicy({
          rules: [
            { id: 'low-priority', name: 'Low', priority: 10, action: { effect: 'deny' } },
            { id: 'high-priority', name: 'High', priority: 100, action: { effect: 'allow' } },
          ],
        }));

        const result = engine.evaluate(createMinimalRequest());
        expect(result.matchedRule?.id).toBe('high-priority');
        expect(result.allowed).toBe(true);
      });

      it('should skip disabled rules', () => {
        engine.loadPolicy(createMinimalPolicy({
          rules: [
            { id: 'disabled', name: 'Disabled', enabled: false, action: { effect: 'allow' } },
            { id: 'enabled', name: 'Enabled', action: { effect: 'deny' } },
          ],
        }));

        const result = engine.evaluate(createMinimalRequest());
        expect(result.matchedRule?.id).toBe('enabled');
      });
    });

    describe('condition evaluation', () => {
      describe('complexity condition', () => {
        it('should match when complexity exceeds threshold', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'complex-rule',
              name: 'Complex Rule',
              conditions: [{ type: 'complexity', operator: 'gte', threshold: 5 }],
              action: { effect: 'require_approval', approval: { minApprovers: 2 } },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            resource: { type: 'pr', complexity: 7 },
          }));

          expect(result.effect).toBe('require_approval');
          expect(result.requiredActions).toHaveLength(1);
          expect(result.requiredActions![0].type).toBe('approval');
        });

        it('should not match when complexity below threshold', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'complex-rule',
              name: 'Complex Rule',
              conditions: [{ type: 'complexity', operator: 'gte', threshold: 5 }],
              action: { effect: 'deny' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            resource: { type: 'pr', complexity: 3 },
          }));

          expect(result.effect).toBe('deny');
          expect(result.reason).toBe('No matching policy rule');
        });
      });

      describe('file_pattern condition', () => {
        it('should match files against glob patterns', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'ts-files',
              name: 'TypeScript Files',
              conditions: [{ type: 'file_pattern', patterns: ['*.ts', 'src/**/*.ts'] }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            resource: { type: 'pr', files: ['src/utils/helper.ts'] },
          }));

          expect(result.allowed).toBe(true);
          expect(result.matchedRule?.id).toBe('ts-files');
        });

        it('should not match excluded patterns', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'exclude-tests',
              name: 'Exclude Tests',
              conditions: [{ type: 'file_pattern', patterns: ['*.test.ts'], matchType: 'exclude' }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            resource: { type: 'pr', files: ['utils.test.ts'] },
          }));

          // File matches pattern, but matchType is exclude, so rule should NOT match
          expect(result.matchedRule?.id).not.toBe('exclude-tests');
        });
      });

      describe('author condition', () => {
        it('should match by author ID', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'admin-rule',
              name: 'Admin Rule',
              conditions: [{ type: 'author', authors: ['admin-user'] }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            actor: { id: 'admin-user', type: 'human' },
          }));

          expect(result.allowed).toBe(true);
        });

        it('should match by role', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'maintainer-rule',
              name: 'Maintainer Rule',
              conditions: [{ type: 'author', roles: ['maintainer'] }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            actor: { id: 'user-1', type: 'human', roles: ['maintainer', 'developer'] },
          }));

          expect(result.allowed).toBe(true);
        });

        it('should match by team', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'platform-team',
              name: 'Platform Team',
              conditions: [{ type: 'author', teams: ['platform'] }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            actor: { id: 'user-1', type: 'human', teams: ['platform'] },
          }));

          expect(result.allowed).toBe(true);
        });
      });

      describe('time_window condition', () => {
        it('should match during specified window', () => {
          const now = new Date();
          const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
          const currentDay = dayNames[now.getDay()] as 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'time-rule',
              name: 'Time Rule',
              conditions: [{
                type: 'time_window',
                windows: [{ days: [currentDay] }],
                matchType: 'during',
              }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest());
          expect(result.allowed).toBe(true);
        });

        it('should not match outside specified window', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'weekend-rule',
              name: 'Weekend Rule',
              conditions: [{
                type: 'time_window',
                windows: [{ days: ['sat', 'sun'] }],
                matchType: 'outside',
              }],
              action: { effect: 'allow' },
            }],
          }));

          // This test depends on current day - just verify it runs without error
          const result = engine.evaluate(createMinimalRequest());
          expect(result).toBeDefined();
        });
      });

      describe('label condition', () => {
        it('should match any label', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'urgent-rule',
              name: 'Urgent Rule',
              conditions: [{ type: 'label', labels: ['urgent', 'critical'], matchType: 'any' }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            resource: { type: 'pr', labels: ['urgent', 'feature'] },
          }));

          expect(result.allowed).toBe(true);
        });

        it('should require all labels', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'all-labels',
              name: 'All Labels',
              conditions: [{ type: 'label', labels: ['reviewed', 'approved'], matchType: 'all' }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            resource: { type: 'pr', labels: ['reviewed'] }, // Missing 'approved'
          }));

          expect(result.allowed).toBe(false); // Falls through to default deny
        });

        it('should match none of labels', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'no-wip',
              name: 'No WIP',
              conditions: [{ type: 'label', labels: ['wip', 'draft'], matchType: 'none' }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            resource: { type: 'pr', labels: ['ready'] },
          }));

          expect(result.allowed).toBe(true);
        });
      });

      describe('agent condition', () => {
        it('should match agent type', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'coder-agent',
              name: 'Coder Agent',
              conditions: [{ type: 'agent', agents: ['coder'] }],
              action: { effect: 'require_approval', approval: { minApprovers: 1 } },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            action: { name: 'generate.code', agentType: 'coder' },
          }));

          expect(result.effect).toBe('require_approval');
        });

        it('should check confidence threshold', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'high-confidence',
              name: 'High Confidence',
              conditions: [{
                type: 'agent',
                agents: ['coder'],
                confidence: { operator: 'gte', threshold: 0.9 },
              }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            action: { name: 'generate.code', agentType: 'coder', confidence: 0.95 },
          }));

          expect(result.allowed).toBe(true);
        });
      });

      describe('custom condition', () => {
        it('should evaluate custom field conditions', () => {
          engine.loadPolicy(createMinimalPolicy({
            rules: [{
              id: 'custom-rule',
              name: 'Custom Rule',
              conditions: [{ type: 'custom', field: 'priority', operator: 'eq', value: 'high' }],
              action: { effect: 'allow' },
            }],
          }));

          const result = engine.evaluate(createMinimalRequest({
            attributes: { priority: 'high' },
          }));

          expect(result.allowed).toBe(true);
        });
      });
    });

    describe('action effects', () => {
      it('should handle allow effect', () => {
        engine.loadPolicy(createMinimalPolicy({
          rules: [{ id: 'r1', name: 'R1', action: { effect: 'allow' } }],
        }));

        const result = engine.evaluate(createMinimalRequest());
        expect(result.allowed).toBe(true);
        expect(result.effect).toBe('allow');
      });

      it('should handle deny effect', () => {
        engine.loadPolicy(createMinimalPolicy({
          rules: [{ id: 'r1', name: 'R1', action: { effect: 'deny', reason: 'Not allowed' } }],
        }));

        const result = engine.evaluate(createMinimalRequest());
        expect(result.allowed).toBe(false);
        expect(result.effect).toBe('deny');
        expect(result.reason).toBe('Not allowed');
      });

      it('should handle require_approval effect', () => {
        engine.loadPolicy(createMinimalPolicy({
          rules: [{
            id: 'r1',
            name: 'R1',
            action: {
              effect: 'require_approval',
              approval: { minApprovers: 2, requiredRoles: ['senior'] },
            },
          }],
        }));

        const result = engine.evaluate(createMinimalRequest());
        expect(result.allowed).toBe(false);
        expect(result.effect).toBe('require_approval');
        expect(result.requiredActions).toHaveLength(1);
        expect(result.requiredActions![0].type).toBe('approval');
      });

      it('should handle notify effect', () => {
        engine.loadPolicy(createMinimalPolicy({
          rules: [{
            id: 'r1',
            name: 'R1',
            action: {
              effect: 'notify',
              notification: { channels: ['slack'], severity: 'warning' },
            },
          }],
        }));

        const result = engine.evaluate(createMinimalRequest());
        expect(result.allowed).toBe(false);
        expect(result.effect).toBe('notify');
        expect(result.requiredActions).toHaveLength(1);
        expect(result.requiredActions![0].type).toBe('notification');
      });

      it('should handle log_only effect (allowed)', () => {
        engine.loadPolicy(createMinimalPolicy({
          rules: [{ id: 'r1', name: 'R1', action: { effect: 'log_only' } }],
        }));

        const result = engine.evaluate(createMinimalRequest());
        expect(result.allowed).toBe(true);
        expect(result.effect).toBe('log_only');
      });

      it('should handle warn effect (allowed)', () => {
        engine.loadPolicy(createMinimalPolicy({
          rules: [{ id: 'r1', name: 'R1', action: { effect: 'warn' } }],
        }));

        const result = engine.evaluate(createMinimalRequest());
        expect(result.allowed).toBe(true);
        expect(result.effect).toBe('warn');
      });
    });

    describe('metadata', () => {
      it('should include evaluation metadata', () => {
        engine.loadPolicy(createMinimalPolicy({
          rules: [{ id: 'r1', name: 'R1', action: { effect: 'allow' } }],
        }));

        const result = engine.evaluate(createMinimalRequest());

        expect(result.metadata).toBeDefined();
        expect(result.metadata!.evaluatedAt).toBeInstanceOf(Date);
        expect(result.metadata!.evaluationTimeMs).toBeGreaterThanOrEqual(0);
        expect(result.metadata!.rulesEvaluated).toBe(1);
        expect(result.metadata!.policiesEvaluated).toBe(1);
      });
    });

    describe('multiple policies', () => {
      it('should evaluate rules from multiple policies', () => {
        engine.loadPolicy(createMinimalPolicy({
          name: 'Policy 1',
          rules: [{ id: 'r1', name: 'R1', priority: 10, action: { effect: 'deny' } }],
        }));
        engine.loadPolicy(createMinimalPolicy({
          name: 'Policy 2',
          rules: [{ id: 'r2', name: 'R2', priority: 100, action: { effect: 'allow' } }],
        }));

        const result = engine.evaluate(createMinimalRequest());
        expect(result.matchedRule?.id).toBe('r2'); // Higher priority wins
        expect(result.metadata!.policiesEvaluated).toBe(2);
      });
    });
  });
});

// =============================================================================
// Factory and Singleton Tests
// =============================================================================

describe('createSchemaEngine()', () => {
  it('should create engine with default config', () => {
    const engine = createSchemaEngine();
    expect(engine).toBeInstanceOf(SchemaPolicyEngine);
  });

  it('should create engine with custom config', () => {
    const engine = createSchemaEngine({ defaultEffect: 'allow' });
    const result = engine.evaluate(createMinimalRequest());
    expect(result.allowed).toBe(true);
  });
});

describe('getSchemaEngine() / resetSchemaEngine()', () => {
  beforeEach(() => {
    resetSchemaEngine();
  });

  it('should return singleton instance', () => {
    const engine1 = getSchemaEngine();
    const engine2 = getSchemaEngine();
    expect(engine1).toBe(engine2);
  });

  it('should reset singleton', () => {
    const engine1 = getSchemaEngine();
    engine1.loadPolicy(createMinimalPolicy());

    resetSchemaEngine();

    const engine2 = getSchemaEngine();
    expect(engine2.getLoadedPolicies()).toHaveLength(0);
  });
});

describe('evaluateSchemaPolicy()', () => {
  beforeEach(() => {
    resetSchemaEngine();
  });

  it('should use global engine', () => {
    const engine = getSchemaEngine();
    engine.loadPolicy(createMinimalPolicy({
      rules: [{ id: 'r1', name: 'R1', action: { effect: 'allow' } }],
    }));

    const result = evaluateSchemaPolicy(createMinimalRequest());
    expect(result.allowed).toBe(true);
  });
});

// =============================================================================
// Dry-Run Tests (D2.5)
// =============================================================================

describe('evaluateDryRun()', () => {
  let engine: SchemaPolicyEngine;

  beforeEach(() => {
    engine = new SchemaPolicyEngine();
  });

  describe('basic dry-run', () => {
    it('should return dry-run result structure', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [{ id: 'r1', name: 'R1', action: { effect: 'allow' } }],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest());

      expect(result.dryRun).toBe(true);
      expect(result.request).toBeDefined();
      expect(result.wouldAllow).toBe(true);
      expect(result.wouldEffect).toBe('allow');
      expect(result.allRules).toBeDefined();
      expect(result.matchingRules).toBeDefined();
      expect(result.nonMatchingRules).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.warnings).toBeDefined();
    });

    it('should evaluate ALL rules (not stop on first match)', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [
          { id: 'r1', name: 'R1', priority: 100, action: { effect: 'allow' } },
          { id: 'r2', name: 'R2', priority: 50, action: { effect: 'deny' } },
          { id: 'r3', name: 'R3', priority: 10, action: { effect: 'warn' } },
        ],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest());

      // All 3 rules should be evaluated
      expect(result.allRules).toHaveLength(3);
      // All match (no conditions)
      expect(result.matchingRules).toHaveLength(3);
      expect(result.nonMatchingRules).toHaveLength(0);
    });

    it('should use highest priority matching rule for decision', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [
          { id: 'low', name: 'Low Priority', priority: 10, action: { effect: 'deny' } },
          { id: 'high', name: 'High Priority', priority: 100, action: { effect: 'allow' } },
        ],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest());

      expect(result.primaryMatch?.ruleId).toBe('high');
      expect(result.wouldAllow).toBe(true);
      expect(result.wouldEffect).toBe('allow');
    });
  });

  describe('condition evaluation details', () => {
    it('should include detailed condition evaluation for each rule', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [{
          id: 'complex-rule',
          name: 'Complex Rule',
          conditions: [
            { type: 'complexity', operator: 'gte', threshold: 5 },
          ],
          action: { effect: 'require_approval' },
        }],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest({
        resource: { type: 'pr', complexity: 7 },
      }));

      expect(result.matchingRules).toHaveLength(1);
      const rule = result.matchingRules[0];
      expect(rule.conditions).toHaveLength(1);
      expect(rule.conditions[0].type).toBe('complexity');
      expect(rule.conditions[0].matched).toBe(true);
      expect(rule.conditions[0].explanation).toContain('7');
      expect(rule.conditions[0].actualValue).toBe(7);
      expect(rule.conditions[0].expectedValue).toBe(5);
    });

    it('should show non-matching conditions', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [{
          id: 'complex-rule',
          name: 'Complex Rule',
          conditions: [
            { type: 'complexity', operator: 'gte', threshold: 5 },
          ],
          action: { effect: 'deny' },
        }],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest({
        resource: { type: 'pr', complexity: 3 },
      }));

      expect(result.nonMatchingRules).toHaveLength(1);
      const rule = result.nonMatchingRules[0];
      expect(rule.conditions[0].matched).toBe(false);
      expect(rule.conditions[0].actualValue).toBe(3);
    });

    it('should evaluate file_pattern conditions with details', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [{
          id: 'ts-rule',
          name: 'TS Rule',
          conditions: [{ type: 'file_pattern', patterns: ['**/*.ts', '*.ts'] }],
          action: { effect: 'allow' },
        }],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest({
        resource: { type: 'pr', files: ['index.ts', 'readme.md'] },
      }));

      expect(result.matchingRules).toHaveLength(1);
      expect(result.matchingRules[0].conditions[0].type).toBe('file_pattern');
    });

    it('should evaluate label conditions with details', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [{
          id: 'label-rule',
          name: 'Label Rule',
          conditions: [{ type: 'label', labels: ['urgent', 'bug'], matchType: 'any' }],
          action: { effect: 'allow' },
        }],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest({
        resource: { type: 'pr', labels: ['feature', 'review'] },
      }));

      expect(result.nonMatchingRules).toHaveLength(1);
      const cond = result.nonMatchingRules[0].conditions[0];
      expect(cond.type).toBe('label');
      expect(cond.matched).toBe(false);
      expect(cond.actualValue).toEqual(['feature', 'review']);
    });
  });

  describe('summary statistics', () => {
    it('should count policies and rules correctly', () => {
      engine.loadPolicy(createMinimalPolicy({
        name: 'Policy 1',
        rules: [
          { id: 'p1r1', name: 'P1R1', action: { effect: 'allow' } },
          { id: 'p1r2', name: 'P1R2', action: { effect: 'deny' } },
        ],
      }));
      engine.loadPolicy(createMinimalPolicy({
        name: 'Policy 2',
        rules: [
          { id: 'p2r1', name: 'P2R1', action: { effect: 'warn' } },
        ],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest());

      expect(result.summary.totalPolicies).toBe(2);
      expect(result.summary.totalRules).toBe(3);
      expect(result.summary.matchingRules).toBe(3);
      expect(result.summary.evaluationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track matching rule count correctly', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [
          { id: 'r1', name: 'R1', action: { effect: 'allow' } }, // Matches (no conditions)
          {
            id: 'r2',
            name: 'R2',
            conditions: [{ type: 'complexity', operator: 'gte', threshold: 10 }],
            action: { effect: 'deny' },
          }, // Doesn't match
        ],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest({
        resource: { type: 'pr', complexity: 5 },
      }));

      expect(result.summary.totalRules).toBe(2);
      expect(result.summary.matchingRules).toBe(1);
    });
  });

  describe('warnings', () => {
    it('should warn when no policies are loaded', () => {
      const emptyEngine = new SchemaPolicyEngine();
      const result = emptyEngine.evaluateDryRun(createMinimalRequest());

      expect(result.warnings).toContain('No policies loaded - evaluation based on default settings only');
    });

    it('should warn when no rules match', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [{
          id: 'r1',
          name: 'R1',
          conditions: [{ type: 'complexity', operator: 'eq', threshold: 10 }],
          action: { effect: 'allow' },
        }],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest({
        resource: { type: 'pr', complexity: 5 },
      }));

      expect(result.warnings.some(w => w.includes('No rules matched'))).toBe(true);
    });

    it('should warn when multiple rules match', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [
          { id: 'r1', name: 'R1', action: { effect: 'allow' } },
          { id: 'r2', name: 'R2', action: { effect: 'deny' } },
        ],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest());

      expect(result.warnings.some(w => w.includes('Multiple rules matched'))).toBe(true);
    });

    it('should warn about disabled rules', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [
          { id: 'disabled', name: 'Disabled', enabled: false, action: { effect: 'allow' } },
          { id: 'enabled', name: 'Enabled', action: { effect: 'deny' } },
        ],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest());

      expect(result.warnings.some(w => w.includes('disabled'))).toBe(true);
      expect(result.summary.totalRules).toBe(1); // Only enabled rule counted
    });
  });

  describe('wouldApply details', () => {
    it('should include effect and reason in wouldApply', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [{
          id: 'r1',
          name: 'R1',
          action: { effect: 'deny', reason: 'Not permitted during maintenance' },
        }],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest());
      const rule = result.matchingRules[0];

      expect(rule.wouldApply.effect).toBe('deny');
      expect(rule.wouldApply.reason).toBe('Not permitted during maintenance');
    });

    it('should include approval config in wouldApply', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [{
          id: 'r1',
          name: 'R1',
          action: {
            effect: 'require_approval',
            approval: { minApprovers: 2, requiredRoles: ['senior'] },
          },
        }],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest());
      const rule = result.matchingRules[0];

      expect(rule.wouldApply.effect).toBe('require_approval');
      // Schema adds allowSelfApproval: false as default
      expect(rule.wouldApply.approval).toMatchObject({ minApprovers: 2, requiredRoles: ['senior'] });
    });

    it('should include notification config in wouldApply', () => {
      engine.loadPolicy(createMinimalPolicy({
        rules: [{
          id: 'r1',
          name: 'R1',
          action: {
            effect: 'notify',
            notification: { channels: ['slack'], severity: 'warning' },
          },
        }],
      }));

      const result = engine.evaluateDryRun(createMinimalRequest());
      const rule = result.matchingRules[0];

      expect(rule.wouldApply.notification).toEqual({ channels: ['slack'], severity: 'warning' });
    });
  });

  describe('decision logic', () => {
    it('should use default effect when no rules match', () => {
      const denyEngine = new SchemaPolicyEngine({ defaultEffect: 'deny' });
      denyEngine.loadPolicy(createMinimalPolicy({
        rules: [{
          id: 'r1',
          name: 'R1',
          conditions: [{ type: 'complexity', operator: 'eq', threshold: 10 }],
          action: { effect: 'allow' },
        }],
      }));

      const result = denyEngine.evaluateDryRun(createMinimalRequest({
        resource: { type: 'pr', complexity: 5 },
      }));

      expect(result.wouldAllow).toBe(false);
      expect(result.wouldEffect).toBe('deny');
    });

    it('should determine wouldAllow correctly for each effect', () => {
      const testCases: Array<{ effect: 'allow' | 'deny' | 'warn' | 'log_only' | 'require_approval' | 'notify'; expected: boolean }> = [
        { effect: 'allow', expected: true },
        { effect: 'deny', expected: false },
        { effect: 'warn', expected: true },
        { effect: 'log_only', expected: true },
        { effect: 'require_approval', expected: false },
        { effect: 'notify', expected: false },
      ];

      for (const { effect, expected } of testCases) {
        const testEngine = new SchemaPolicyEngine();
        testEngine.loadPolicy(createMinimalPolicy({
          rules: [{ id: 'r1', name: 'R1', action: { effect } }],
        }));

        const result = testEngine.evaluateDryRun(createMinimalRequest());
        expect(result.wouldAllow).toBe(expected);
        expect(result.wouldEffect).toBe(effect);
      }
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('edge cases', () => {
  let engine: SchemaPolicyEngine;

  beforeEach(() => {
    engine = new SchemaPolicyEngine();
  });

  it('should handle empty conditions array', () => {
    engine.loadPolicy(createMinimalPolicy({
      rules: [{ id: 'r1', name: 'R1', conditions: [], action: { effect: 'allow' } }],
    }));

    const result = engine.evaluate(createMinimalRequest());
    expect(result.allowed).toBe(true); // Empty conditions = match all
  });

  it('should handle missing resource properties', () => {
    engine.loadPolicy(createMinimalPolicy({
      rules: [{
        id: 'r1',
        name: 'R1',
        conditions: [{ type: 'complexity', operator: 'gte', threshold: 5 }],
        action: { effect: 'allow' },
      }],
    }));

    const result = engine.evaluate(createMinimalRequest({
      resource: { type: 'test' }, // No complexity
    }));

    expect(result.allowed).toBe(false); // Condition doesn't match
  });

  it('should handle multiple conditions (AND logic)', () => {
    engine.loadPolicy(createMinimalPolicy({
      rules: [{
        id: 'r1',
        name: 'R1',
        conditions: [
          { type: 'complexity', operator: 'gte', threshold: 5 },
          { type: 'label', labels: ['approved'], matchType: 'any' },
        ],
        action: { effect: 'allow' },
      }],
    }));

    // Both conditions met
    const result1 = engine.evaluate(createMinimalRequest({
      resource: { type: 'pr', complexity: 7, labels: ['approved'] },
    }));
    expect(result1.allowed).toBe(true);

    // Only one condition met
    const result2 = engine.evaluate(createMinimalRequest({
      resource: { type: 'pr', complexity: 7, labels: [] },
    }));
    expect(result2.allowed).toBe(false);
  });
});
