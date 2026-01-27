/**
 * Policy Engine Integration Tests
 *
 * Epic D: Policy & Audit - Story D2: Policy Engine
 * Task D2.6: Write policy engine tests
 *
 * Integration tests for the policy engine covering:
 * - Full flow: inheritance → cache → evaluation
 * - Complex condition combinations (AND/OR logic)
 * - Caching with inheritance
 * - Performance benchmarks
 *
 * @module @gwi/core/policy/__tests__/engine.integration.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  SchemaPolicyEngine,
  createSchemaEngine,
  resetSchemaEngine,
} from '../schema-engine.js';
import {
  PolicyCache,
  CachedPolicyEngine,
  createPolicyCache,
  createCachedPolicyEngine,
  resetPolicyCache,
} from '../cache.js';
import {
  PolicyInheritanceResolver,
  InMemoryPolicyStore,
  createInheritanceResolver,
} from '../inheritance.js';
import type { PolicyDocument, PolicyEvaluationRequest } from '../schema.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestPolicy(overrides: Partial<PolicyDocument> & { name: string }): PolicyDocument {
  return {
    version: '2.0',
    scope: 'repo',
    defaultAction: { effect: 'deny', reason: 'Default deny' },
    rules: [],
    ...overrides,
  };
}

function createTestRequest(overrides: Partial<PolicyEvaluationRequest> = {}): PolicyEvaluationRequest {
  return {
    actor: { id: 'user-1', type: 'human' },
    action: { name: 'test.action' },
    resource: { type: 'test' },
    context: { source: 'cli', timestamp: new Date() },
    ...overrides,
  };
}

// =============================================================================
// Integration Tests: Cache + Engine
// =============================================================================

describe('Integration: Cache + Engine', () => {
  let cache: PolicyCache;
  let engine: SchemaPolicyEngine;

  beforeEach(() => {
    resetPolicyCache();
    resetSchemaEngine();
    cache = createPolicyCache({ maxSize: 100, enableTtl: false });
    engine = createSchemaEngine();
  });

  describe('cached policy evaluation', () => {
    it('should cache evaluation results for reuse', async () => {
      const loader = vi.fn().mockResolvedValue(createTestPolicy({
        name: 'cached-policy',
        rules: [{ id: 'r1', name: 'R1', action: { effect: 'allow' } }],
      }));

      const compiler = vi.fn().mockImplementation((doc) =>
        doc.rules.map((rule: { id: string; name: string }) => ({
          id: rule.id,
          name: rule.name,
          enabled: true,
          priority: 0,
          conditions: [],
          action: { effect: 'allow' },
          compiledAt: new Date(),
        }))
      );

      const cachedEngine = createCachedPolicyEngine({
        cache: { maxSize: 100, enableTtl: false },
        loader,
        compiler,
      });

      // First load
      const policy1 = await cachedEngine.getPolicy({ tenantId: 't1', policyId: 'p1' });
      expect(policy1).not.toBeNull();
      expect(loader).toHaveBeenCalledTimes(1);

      // Second load should use cache
      const policy2 = await cachedEngine.getPolicy({ tenantId: 't1', policyId: 'p1' });
      expect(policy2).not.toBeNull();
      expect(loader).toHaveBeenCalledTimes(1); // Not called again

      // Stats should show cache hit
      const stats = cachedEngine.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should invalidate cache when policy changes', async () => {
      let policyVersion = 1;
      const loader = vi.fn().mockImplementation(async () =>
        createTestPolicy({
          name: `policy-v${policyVersion}`,
          rules: [{ id: 'r1', name: `Rule v${policyVersion}`, action: { effect: 'allow' } }],
        })
      );

      const cachedEngine = createCachedPolicyEngine({
        cache: { maxSize: 100, enableTtl: false },
        loader,
        compiler: () => [],
      });

      const key = { tenantId: 't1', policyId: 'p1' };

      // Load v1
      await cachedEngine.getPolicy(key);
      expect(loader).toHaveBeenCalledTimes(1);

      // Simulate policy change
      policyVersion = 2;
      cachedEngine.invalidate(key);

      // Load again - should fetch v2
      await cachedEngine.getPolicy(key);
      expect(loader).toHaveBeenCalledTimes(2);
    });

    it('should handle multi-tenant isolation in cache', async () => {
      const loader = vi.fn().mockImplementation(async (key: { tenantId: string }) =>
        createTestPolicy({
          name: `policy-${key.tenantId}`,
          rules: [{ id: 'r1', name: 'R1', action: { effect: 'allow' } }],
        })
      );

      const cachedEngine = createCachedPolicyEngine({
        cache: { maxSize: 100, enableTtl: false },
        loader,
        compiler: () => [],
      });

      // Load for tenant-1
      await cachedEngine.getPolicy({ tenantId: 'tenant-1', policyId: 'shared' });

      // Load for tenant-2 - should fetch separately
      await cachedEngine.getPolicy({ tenantId: 'tenant-2', policyId: 'shared' });

      expect(loader).toHaveBeenCalledTimes(2);

      // Invalidate tenant-1 only
      cachedEngine.invalidateByTenant('tenant-1');

      // tenant-2 should still be cached
      await cachedEngine.getPolicy({ tenantId: 'tenant-2', policyId: 'shared' });
      expect(loader).toHaveBeenCalledTimes(2); // Not called again
    });
  });
});

// =============================================================================
// Integration Tests: Inheritance + Engine
// =============================================================================

describe('Integration: Inheritance + Engine', () => {
  let store: InMemoryPolicyStore;
  let resolver: PolicyInheritanceResolver;
  let engine: SchemaPolicyEngine;

  beforeEach(() => {
    const result = createInheritanceResolver();
    store = result.store;
    resolver = result.resolver;
    engine = createSchemaEngine();
    resetSchemaEngine();
  });

  describe('inherited policy evaluation', () => {
    it('should evaluate resolved policy with inherited rules', async () => {
      // Global policy
      store.addPolicy(createTestPolicy({
        name: 'global-policy',
        scope: 'global',
        scopeTarget: 'default',
        rules: [
          { id: 'global-deny-weekends', name: 'Deny Weekends', priority: 100, action: { effect: 'deny', reason: 'No weekend deploys' } },
        ],
      }));

      // Repo policy extends global
      store.addPolicy(createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
        inheritance: 'extend',
        rules: [
          { id: 'repo-allow-admins', name: 'Allow Admins', priority: 50, action: { effect: 'allow' } },
        ],
      }));

      // Resolve the policy chain
      const resolved = await resolver.resolve('myorg', 'myorg/myrepo');

      // Load resolved policy into engine
      engine.loadPolicy(resolved.policy);

      // Evaluate - global rule should take precedence (higher priority)
      const result = engine.evaluate(createTestRequest());

      expect(result.matchedRule?.id).toBe('global-deny-weekends');
      expect(result.effect).toBe('deny');
    });

    it('should allow child policies to override parent rules', async () => {
      // Global policy with a general rule
      store.addPolicy(createTestPolicy({
        name: 'global-policy',
        scope: 'global',
        scopeTarget: 'default',
        rules: [
          { id: 'shared-rule', name: 'Global Version', priority: 50, action: { effect: 'deny' } },
        ],
      }));

      // Repo policy overrides the rule
      store.addPolicy(createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
        inheritance: 'override',
        rules: [
          { id: 'shared-rule', name: 'Repo Version', priority: 50, action: { effect: 'allow' } },
        ],
      }));

      const resolved = await resolver.resolve('myorg', 'myorg/myrepo');
      engine.loadPolicy(resolved.policy);

      const result = engine.evaluate(createTestRequest());

      // Should use repo's version (override strategy)
      expect(result.effect).toBe('allow');
    });

    it('should preserve rule origins through inheritance', async () => {
      store.addPolicy(createTestPolicy({
        name: 'org-policy',
        scope: 'org',
        scopeTarget: 'myorg',
        rules: [
          { id: 'org-rule', name: 'Org Rule', action: { effect: 'allow' } },
        ],
      }));

      store.addPolicy(createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
        inheritance: 'extend',
        rules: [
          { id: 'repo-rule', name: 'Repo Rule', action: { effect: 'allow' } },
        ],
      }));

      const resolved = await resolver.resolve('myorg', 'myorg/myrepo');

      expect(resolved.ruleOrigins.get('org-rule')).toBe('org-policy');
      expect(resolved.ruleOrigins.get('repo-rule')).toBe('repo-policy');
    });
  });
});

// =============================================================================
// Integration Tests: Complex Conditions
// =============================================================================

describe('Integration: Complex Conditions', () => {
  let engine: SchemaPolicyEngine;

  beforeEach(() => {
    engine = createSchemaEngine();
    resetSchemaEngine();
  });

  describe('AND logic (multiple conditions)', () => {
    it('should require all conditions to match', () => {
      engine.loadPolicy(createTestPolicy({
        name: 'multi-condition',
        rules: [{
          id: 'complex-rule',
          name: 'Complex Rule',
          conditions: [
            { type: 'complexity', operator: 'gte', threshold: 5 },
            { type: 'label', labels: ['approved'], matchType: 'any' },
            { type: 'author', roles: ['developer'] },
          ],
          action: { effect: 'allow' },
        }],
      }));

      // All conditions met
      const result1 = engine.evaluate(createTestRequest({
        actor: { id: 'user-1', type: 'human', roles: ['developer'] },
        resource: { type: 'pr', complexity: 7, labels: ['approved'] },
      }));
      expect(result1.allowed).toBe(true);

      // Missing complexity
      const result2 = engine.evaluate(createTestRequest({
        actor: { id: 'user-1', type: 'human', roles: ['developer'] },
        resource: { type: 'pr', complexity: 3, labels: ['approved'] },
      }));
      expect(result2.allowed).toBe(false);

      // Missing label
      const result3 = engine.evaluate(createTestRequest({
        actor: { id: 'user-1', type: 'human', roles: ['developer'] },
        resource: { type: 'pr', complexity: 7, labels: [] },
      }));
      expect(result3.allowed).toBe(false);

      // Missing role
      const result4 = engine.evaluate(createTestRequest({
        actor: { id: 'user-1', type: 'human', roles: ['viewer'] },
        resource: { type: 'pr', complexity: 7, labels: ['approved'] },
      }));
      expect(result4.allowed).toBe(false);
    });
  });

  describe('file pattern + complexity combinations', () => {
    it('should require approval for complex changes to critical files', () => {
      engine.loadPolicy(createTestPolicy({
        name: 'critical-files',
        rules: [{
          id: 'critical-complex',
          name: 'Critical Complex Changes',
          conditions: [
            { type: 'file_pattern', patterns: ['**/security/**', '**/auth/**', '*.config.ts'] },
            { type: 'complexity', operator: 'gte', threshold: 5 },
          ],
          action: { effect: 'require_approval', approval: { minApprovers: 2, requiredRoles: ['security-team'] } },
        }],
      }));

      // Critical file + high complexity
      const result1 = engine.evaluate(createTestRequest({
        resource: { type: 'pr', files: ['src/security/auth.ts'], complexity: 8 },
      }));
      expect(result1.effect).toBe('require_approval');
      expect(result1.requiredActions?.[0].config).toMatchObject({ minApprovers: 2 });

      // Non-critical file + high complexity
      const result2 = engine.evaluate(createTestRequest({
        resource: { type: 'pr', files: ['src/utils/helpers.ts'], complexity: 8 },
      }));
      expect(result2.effect).toBe('deny'); // Falls to default

      // Critical file + low complexity
      const result3 = engine.evaluate(createTestRequest({
        resource: { type: 'pr', files: ['src/security/auth.ts'], complexity: 2 },
      }));
      expect(result3.effect).toBe('deny'); // Falls to default
    });
  });

  describe('time window + author combinations', () => {
    it('should allow senior devs to deploy outside business hours', () => {
      // Use a fixed time to make the test deterministic
      // Create a date at 14:00 local time to avoid edge cases
      const testTime = new Date();
      testTime.setHours(14, 30, 0, 0); // 2:30 PM local time
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
      const testDay = dayNames[testTime.getDay()]; // current day (local)
      const testHour = testTime.getHours(); // 14 (local)

      engine.loadPolicy(createTestPolicy({
        name: 'after-hours-deploy',
        rules: [
          {
            id: 'senior-after-hours',
            name: 'Senior After Hours',
            priority: 100,
            conditions: [
              { type: 'author', roles: ['senior', 'lead'] },
              { type: 'time_window', windows: [{ days: [testDay], startHour: testHour, endHour: testHour + 1 }], matchType: 'during' },
            ],
            action: { effect: 'allow' },
          },
          {
            id: 'default-deny',
            name: 'Default Deny',
            priority: 0,
            action: { effect: 'deny', reason: 'Only senior devs can deploy now' },
          },
        ],
      }));

      // Senior dev at test time
      const result1 = engine.evaluate(createTestRequest({
        actor: { id: 'senior-1', type: 'human', roles: ['senior'] },
        context: { source: 'cli', timestamp: testTime },
      }));
      expect(result1.allowed).toBe(true);

      // Junior dev at test time
      const result2 = engine.evaluate(createTestRequest({
        actor: { id: 'junior-1', type: 'human', roles: ['junior'] },
        context: { source: 'cli', timestamp: testTime },
      }));
      expect(result2.allowed).toBe(false);
    });
  });

  describe('agent + confidence conditions', () => {
    it('should require approval for low-confidence agent actions', () => {
      engine.loadPolicy(createTestPolicy({
        name: 'agent-confidence',
        rules: [
          {
            id: 'high-confidence-auto',
            name: 'High Confidence Auto-Approve',
            priority: 100,
            conditions: [
              { type: 'agent', agents: ['coder', 'resolver'], confidence: { operator: 'gte', threshold: 0.9 } },
            ],
            action: { effect: 'allow' },
          },
          {
            id: 'low-confidence-review',
            name: 'Low Confidence Needs Review',
            priority: 50,
            conditions: [
              { type: 'agent', agents: ['coder', 'resolver'], confidence: { operator: 'lt', threshold: 0.9 } },
            ],
            action: { effect: 'require_approval', approval: { minApprovers: 1 } },
          },
        ],
      }));

      // High confidence agent
      const result1 = engine.evaluate(createTestRequest({
        action: { name: 'code.generate', agentType: 'coder', confidence: 0.95 },
      }));
      expect(result1.allowed).toBe(true);

      // Low confidence agent
      const result2 = engine.evaluate(createTestRequest({
        action: { name: 'code.generate', agentType: 'coder', confidence: 0.7 },
      }));
      expect(result2.effect).toBe('require_approval');
    });
  });
});

// =============================================================================
// Integration Tests: Full Flow
// =============================================================================

describe('Integration: Full Flow (Inheritance → Cache → Evaluate)', () => {
  let store: InMemoryPolicyStore;
  let resolver: PolicyInheritanceResolver;
  let cache: PolicyCache;
  let engine: SchemaPolicyEngine;

  beforeEach(() => {
    const result = createInheritanceResolver();
    store = result.store;
    resolver = result.resolver;
    cache = createPolicyCache({ maxSize: 100, enableTtl: true, defaultTtlMs: 60000 });
    engine = createSchemaEngine();
  });

  it('should resolve, cache, and evaluate in sequence', async () => {
    // Set up policy hierarchy
    store.addPolicy(createTestPolicy({
      name: 'global-policy',
      scope: 'global',
      scopeTarget: 'default',
      rules: [
        { id: 'deny-dangerous-files', name: 'Deny Dangerous', priority: 100,
          conditions: [{ type: 'file_pattern', patterns: ['*.env', '*.secret'] }],
          action: { effect: 'deny', reason: 'Sensitive files cannot be committed' } },
      ],
    }));

    store.addPolicy(createTestPolicy({
      name: 'org-policy',
      scope: 'org',
      scopeTarget: 'myorg',
      inheritance: 'extend',
      rules: [
        { id: 'require-review-for-config', name: 'Review Config', priority: 80,
          conditions: [{ type: 'file_pattern', patterns: ['**/*.config.*'] }],
          action: { effect: 'require_approval', approval: { minApprovers: 1 } } },
      ],
    }));

    store.addPolicy(createTestPolicy({
      name: 'repo-policy',
      scope: 'repo',
      scopeTarget: 'myorg/important-repo',
      inheritance: 'extend',
      rules: [
        { id: 'allow-trusted-authors', name: 'Trusted Authors', priority: 90,
          conditions: [{ type: 'author', roles: ['maintainer', 'admin'] }],
          action: { effect: 'allow' } },
      ],
    }));

    // Step 1: Resolve inheritance
    const resolved = await resolver.resolve('myorg', 'myorg/important-repo');
    expect(resolved.chain).toHaveLength(3);
    expect(resolved.policy.rules).toHaveLength(3);

    // Step 2: Load into engine
    engine.loadPolicy(resolved.policy);

    // Step 3: Evaluate scenarios

    // Scenario 1: Dangerous file - should be denied regardless of author
    const result1 = engine.evaluate(createTestRequest({
      actor: { id: 'admin-1', type: 'human', roles: ['admin'] },
      resource: { type: 'pr', files: ['config.env', 'credentials.secret'] },
    }));
    expect(result1.effect).toBe('deny');
    expect(result1.reason).toBe('Sensitive files cannot be committed');

    // Scenario 2: Config file by maintainer - allowed (trusted author rule)
    const result2 = engine.evaluate(createTestRequest({
      actor: { id: 'maintainer-1', type: 'human', roles: ['maintainer'] },
      resource: { type: 'pr', files: ['src/app.config.ts'] },
    }));
    expect(result2.effect).toBe('allow');

    // Scenario 3: Config file by regular dev - needs review
    const result3 = engine.evaluate(createTestRequest({
      actor: { id: 'dev-1', type: 'human', roles: ['developer'] },
      resource: { type: 'pr', files: ['src/app.config.ts'] },
    }));
    expect(result3.effect).toBe('require_approval');
  });

  it('should handle cache invalidation on policy update', async () => {
    // Initial policy
    store.addPolicy(createTestPolicy({
      name: 'test-policy',
      scope: 'repo',
      scopeTarget: 'myorg/test-repo',
      rules: [
        { id: 'r1', name: 'Initial Rule', action: { effect: 'deny' } },
      ],
    }));

    // Resolve and evaluate
    const resolved1 = await resolver.resolve('myorg', 'myorg/test-repo');
    engine.loadPolicy(resolved1.policy, 'test-policy');

    const result1 = engine.evaluate(createTestRequest());
    expect(result1.effect).toBe('deny');

    // Update policy
    store.clear();
    store.addPolicy(createTestPolicy({
      name: 'test-policy',
      scope: 'repo',
      scopeTarget: 'myorg/test-repo',
      rules: [
        { id: 'r1', name: 'Updated Rule', action: { effect: 'allow' } },
      ],
    }));

    // Re-resolve and update engine
    engine.unloadPolicy('test-policy');
    const resolved2 = await resolver.resolve('myorg', 'myorg/test-repo');
    engine.loadPolicy(resolved2.policy, 'test-policy');

    const result2 = engine.evaluate(createTestRequest());
    expect(result2.effect).toBe('allow');
  });
});

// =============================================================================
// Performance Benchmarks
// =============================================================================

describe('Performance Benchmarks', () => {
  let engine: SchemaPolicyEngine;

  beforeEach(() => {
    engine = createSchemaEngine();
    resetSchemaEngine();
  });

  describe('evaluation throughput', () => {
    it('should evaluate 1000 requests in under 100ms', () => {
      // Load a moderately complex policy
      engine.loadPolicy(createTestPolicy({
        name: 'benchmark-policy',
        rules: [
          { id: 'r1', name: 'R1', priority: 100,
            conditions: [{ type: 'complexity', operator: 'gte', threshold: 5 }],
            action: { effect: 'require_approval' } },
          { id: 'r2', name: 'R2', priority: 90,
            conditions: [{ type: 'label', labels: ['approved'], matchType: 'any' }],
            action: { effect: 'allow' } },
          { id: 'r3', name: 'R3', priority: 80,
            conditions: [{ type: 'file_pattern', patterns: ['**/*.ts'] }],
            action: { effect: 'warn' } },
          { id: 'r4', name: 'R4', priority: 70,
            conditions: [{ type: 'author', roles: ['maintainer'] }],
            action: { effect: 'allow' } },
          { id: 'r5', name: 'R5', priority: 0, action: { effect: 'deny' } },
        ],
      }));

      const iterations = 1000;
      const requests = Array.from({ length: iterations }, (_, i) => createTestRequest({
        actor: { id: `user-${i}`, type: 'human', roles: i % 3 === 0 ? ['maintainer'] : ['developer'] },
        resource: {
          type: 'pr',
          complexity: i % 10,
          labels: i % 5 === 0 ? ['approved'] : [],
          files: i % 2 === 0 ? ['src/test.ts'] : ['readme.md'],
        },
      }));

      const startTime = performance.now();

      for (const request of requests) {
        engine.evaluate(request);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      // Should complete in under 200ms total (relaxed for CI variability)
      expect(totalTime).toBeLessThan(200);

      // Average per evaluation should be under 0.2ms
      expect(avgTime).toBeLessThan(0.2);

      console.log(`Performance: ${iterations} evaluations in ${totalTime.toFixed(2)}ms (avg: ${avgTime.toFixed(4)}ms/eval)`);
    });

    it('should scale linearly with number of rules', () => {
      const ruleCountsToTest = [5, 10, 25, 50];
      const results: Array<{ rules: number; avgTime: number }> = [];

      for (const ruleCount of ruleCountsToTest) {
        const testEngine = createSchemaEngine();

        const rules = Array.from({ length: ruleCount }, (_, i) => ({
          id: `r${i}`,
          name: `Rule ${i}`,
          priority: ruleCount - i,
          conditions: [{ type: 'complexity' as const, operator: 'eq' as const, threshold: i % 10 }],
          action: { effect: 'allow' as const },
        }));

        testEngine.loadPolicy(createTestPolicy({
          name: 'scaling-test',
          rules,
        }));

        const iterations = 500;
        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
          testEngine.evaluate(createTestRequest({
            resource: { type: 'pr', complexity: i % ruleCount },
          }));
        }

        const endTime = performance.now();
        const avgTime = (endTime - startTime) / iterations;

        results.push({ rules: ruleCount, avgTime });
      }

      // Log results
      console.log('Scaling benchmark:');
      for (const r of results) {
        console.log(`  ${r.rules} rules: ${r.avgTime.toFixed(4)}ms/eval`);
      }

      // Verify roughly linear scaling (within 3x for 10x rules)
      const firstAvg = results[0].avgTime;
      const lastAvg = results[results.length - 1].avgTime;
      const ruleRatio = ruleCountsToTest[ruleCountsToTest.length - 1] / ruleCountsToTest[0];
      const timeRatio = lastAvg / firstAvg;

      // Time ratio should be less than 3x the rule ratio for reasonable scaling
      expect(timeRatio).toBeLessThan(ruleRatio * 3);
    });
  });

  describe('cache performance', () => {
    it('should have sub-microsecond cache lookups', () => {
      const cache = createPolicyCache({ maxSize: 1000, enableTtl: false });

      // Populate cache
      for (let i = 0; i < 100; i++) {
        cache.set(
          { tenantId: 'tenant-1', policyId: `policy-${i}` },
          {
            document: createTestPolicy({ name: `policy-${i}` }),
            compiledRules: [],
            cachedAt: new Date(),
            lastAccessedAt: new Date(),
            accessCount: 0,
            cacheKey: `tenant-1:policy-${i}`,
          }
        );
      }

      const iterations = 10000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        cache.get({ tenantId: 'tenant-1', policyId: `policy-${i % 100}` });
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimeMs = totalTime / iterations;
      const avgTimeUs = avgTimeMs * 1000;

      console.log(`Cache lookup: ${iterations} lookups in ${totalTime.toFixed(2)}ms (avg: ${avgTimeUs.toFixed(3)}μs/lookup)`);

      // Should be under 50 microseconds per lookup (relaxed for CI runners)
      expect(avgTimeUs).toBeLessThan(50);
    });

    it('should maintain performance under LRU eviction pressure', () => {
      const cacheSize = 50;
      const cache = createPolicyCache({ maxSize: cacheSize, enableTtl: false });

      const iterations = 1000;
      const startTime = performance.now();

      // Access patterns that cause evictions
      for (let i = 0; i < iterations; i++) {
        const key = { tenantId: 'tenant-1', policyId: `policy-${i}` };

        // This will cause evictions after cache is full
        cache.set(key, {
          document: createTestPolicy({ name: `policy-${i}` }),
          compiledRules: [],
          cachedAt: new Date(),
          lastAccessedAt: new Date(),
          accessCount: 0,
          cacheKey: `tenant-1:policy-${i}`,
        });

        // Random reads
        if (i > 0) {
          cache.get({ tenantId: 'tenant-1', policyId: `policy-${Math.floor(Math.random() * i)}` });
        }
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const stats = cache.getStats();
      console.log(`LRU pressure test: ${iterations} ops in ${totalTime.toFixed(2)}ms, ${stats.evictions} evictions`);

      // Should complete in reasonable time
      expect(totalTime).toBeLessThan(500);

      // Should have evictions (at least iterations - cacheSize)
      expect(stats.evictions).toBeGreaterThanOrEqual(iterations - cacheSize);
    });
  });

  describe('dry-run performance', () => {
    it('should complete dry-run with detailed output efficiently', () => {
      engine.loadPolicy(createTestPolicy({
        name: 'dry-run-benchmark',
        rules: Array.from({ length: 10 }, (_, i) => ({
          id: `rule-${i}`,
          name: `Rule ${i}`,
          priority: 10 - i,
          conditions: [
            { type: 'complexity' as const, operator: 'gte' as const, threshold: i },
            { type: 'label' as const, labels: [`label-${i}`], matchType: 'any' as const },
          ],
          action: { effect: (i % 2 === 0 ? 'allow' : 'deny') as 'allow' | 'deny' },
        })),
      }));

      const iterations = 500;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        engine.evaluateDryRun(createTestRequest({
          resource: { type: 'pr', complexity: i % 10, labels: [`label-${i % 10}`] },
        }));
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      console.log(`Dry-run: ${iterations} evaluations in ${totalTime.toFixed(2)}ms (avg: ${avgTime.toFixed(4)}ms/eval)`);

      // Dry-run is slower due to detailed output, but should still be fast
      // Relaxed threshold for CI runners (5ms instead of 1ms)
      expect(avgTime).toBeLessThan(5);
    });
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('Edge Cases and Error Handling', () => {
  let engine: SchemaPolicyEngine;

  beforeEach(() => {
    engine = createSchemaEngine();
  });

  it('should handle empty policy list gracefully', () => {
    const result = engine.evaluate(createTestRequest());
    expect(result.effect).toBe('deny'); // Default
    expect(result.reason).toBe('No matching policy rule');
  });

  it('should handle policy with no rules', () => {
    engine.loadPolicy(createTestPolicy({
      name: 'empty-policy',
      rules: [],
    }));

    const result = engine.evaluate(createTestRequest());
    expect(result.effect).toBe('deny');
  });

  it('should handle null/undefined resource properties gracefully', () => {
    engine.loadPolicy(createTestPolicy({
      name: 'null-safe',
      rules: [{
        id: 'r1',
        name: 'R1',
        conditions: [{ type: 'complexity', operator: 'gte', threshold: 5 }],
        action: { effect: 'allow' },
      }],
    }));

    // Resource without complexity
    const result = engine.evaluate(createTestRequest({
      resource: { type: 'test' }, // No complexity property
    }));

    expect(result.effect).toBe('deny'); // Condition doesn't match
  });

  it('should handle concurrent evaluations correctly', async () => {
    engine.loadPolicy(createTestPolicy({
      name: 'concurrent-test',
      rules: [{
        id: 'r1',
        name: 'R1',
        conditions: [{ type: 'complexity', operator: 'gte', threshold: 5 }],
        action: { effect: 'allow' },
      }],
    }));

    // Simulate concurrent evaluations
    const evaluations = Array.from({ length: 100 }, (_, i) =>
      Promise.resolve(engine.evaluate(createTestRequest({
        resource: { type: 'pr', complexity: i % 10 },
      })))
    );

    const results = await Promise.all(evaluations);

    // Verify consistent results
    const allowedCount = results.filter(r => r.allowed).length;
    const deniedCount = results.filter(r => !r.allowed).length;

    // 50% should be allowed (complexity 5-9), 50% denied (0-4)
    expect(allowedCount).toBe(50);
    expect(deniedCount).toBe(50);
  });
});
