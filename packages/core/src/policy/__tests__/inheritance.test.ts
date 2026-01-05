/**
 * Policy Inheritance Tests
 *
 * Epic D: Policy & Audit - Story D1: Policy Definition Schema
 * Task D1.4: Implement policy inheritance
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  PolicyInheritanceResolver,
  InMemoryPolicyStore,
  createInheritanceResolver,
  getScopePriority,
  isScopeMoreSpecific,
  getParentScope,
  validateInheritanceChain,
  SCOPE_HIERARCHY,
} from '../inheritance.js';

import {
  type PolicyDocument,
  type PolicyRule,
  validatePolicyDocument,
} from '../schema.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestPolicy(overrides: Partial<PolicyDocument> & { name: string }): PolicyDocument {
  return validatePolicyDocument({
    version: '2.0',
    scope: 'repo',
    rules: [],
    ...overrides,
  });
}

function createTestRule(overrides: Partial<PolicyRule> & { id: string; name: string }): PolicyRule {
  return {
    enabled: true,
    priority: 0,
    action: { effect: 'allow' },
    ...overrides,
  };
}

// =============================================================================
// Scope Hierarchy Tests
// =============================================================================

describe('Scope Hierarchy', () => {
  describe('SCOPE_HIERARCHY', () => {
    it('should define correct hierarchy order', () => {
      expect(SCOPE_HIERARCHY).toEqual(['global', 'org', 'repo', 'branch']);
    });
  });

  describe('getScopePriority', () => {
    it('should return correct priority for each scope', () => {
      expect(getScopePriority('global')).toBe(0);
      expect(getScopePriority('org')).toBe(1);
      expect(getScopePriority('repo')).toBe(2);
      expect(getScopePriority('branch')).toBe(3);
    });
  });

  describe('isScopeMoreSpecific', () => {
    it('should correctly compare scope specificity', () => {
      expect(isScopeMoreSpecific('branch', 'repo')).toBe(true);
      expect(isScopeMoreSpecific('repo', 'org')).toBe(true);
      expect(isScopeMoreSpecific('org', 'global')).toBe(true);

      expect(isScopeMoreSpecific('repo', 'branch')).toBe(false);
      expect(isScopeMoreSpecific('global', 'org')).toBe(false);
      expect(isScopeMoreSpecific('repo', 'repo')).toBe(false);
    });
  });

  describe('getParentScope', () => {
    it('should return correct parent scope', () => {
      expect(getParentScope('branch')).toBe('repo');
      expect(getParentScope('repo')).toBe('org');
      expect(getParentScope('org')).toBe('global');
      expect(getParentScope('global')).toBeNull();
    });
  });

  describe('validateInheritanceChain', () => {
    it('should validate correct inheritance', () => {
      const parent = createTestPolicy({ name: 'org-policy', scope: 'org' });
      const child = createTestPolicy({ name: 'repo-policy', scope: 'repo' });

      const result = validateInheritanceChain(child, parent);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid inheritance (child less specific)', () => {
      const parent = createTestPolicy({ name: 'repo-policy', scope: 'repo' });
      const child = createTestPolicy({ name: 'org-policy', scope: 'org' });

      const result = validateInheritanceChain(child, parent);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('more specific');
    });

    it('should reject same-scope inheritance', () => {
      const parent = createTestPolicy({ name: 'policy-1', scope: 'repo' });
      const child = createTestPolicy({ name: 'policy-2', scope: 'repo' });

      const result = validateInheritanceChain(child, parent);
      expect(result.valid).toBe(false);
    });
  });
});

// =============================================================================
// InMemoryPolicyStore Tests
// =============================================================================

describe('InMemoryPolicyStore', () => {
  let store: InMemoryPolicyStore;

  beforeEach(() => {
    store = new InMemoryPolicyStore();
  });

  describe('addPolicy / getPolicy', () => {
    it('should store and retrieve policies', async () => {
      const policy = createTestPolicy({
        name: 'test-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
      });

      store.addPolicy(policy);

      const retrieved = await store.getPolicy('repo:myorg/myrepo:test-policy');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('test-policy');
    });

    it('should return null for non-existent policy', async () => {
      const result = await store.getPolicy('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getPoliciesForScope', () => {
    it('should retrieve policies by scope', async () => {
      store.addPolicy(createTestPolicy({
        name: 'policy-1',
        scope: 'org',
        scopeTarget: 'myorg',
      }));
      store.addPolicy(createTestPolicy({
        name: 'policy-2',
        scope: 'org',
        scopeTarget: 'myorg',
      }));
      store.addPolicy(createTestPolicy({
        name: 'policy-3',
        scope: 'org',
        scopeTarget: 'other-org',
      }));

      const policies = await store.getPoliciesForScope('org', 'myorg');
      expect(policies).toHaveLength(2);
      expect(policies.map(p => p.name).sort()).toEqual(['policy-1', 'policy-2']);
    });
  });

  describe('getPolicyChain', () => {
    it('should build policy chain from global to branch', async () => {
      store.addPolicy(createTestPolicy({
        name: 'global-policy',
        scope: 'global',
        scopeTarget: 'default',
      }));
      store.addPolicy(createTestPolicy({
        name: 'org-policy',
        scope: 'org',
        scopeTarget: 'myorg',
      }));
      store.addPolicy(createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
      }));
      store.addPolicy(createTestPolicy({
        name: 'branch-policy',
        scope: 'branch',
        scopeTarget: 'main',
      }));

      const chain = await store.getPolicyChain('myorg', 'myorg/myrepo', 'main');
      expect(chain).toHaveLength(4);
      expect(chain.map(p => p.name)).toEqual([
        'global-policy',
        'org-policy',
        'repo-policy',
        'branch-policy',
      ]);
    });

    it('should handle partial chain (no branch)', async () => {
      store.addPolicy(createTestPolicy({
        name: 'global-policy',
        scope: 'global',
        scopeTarget: 'default',
      }));
      store.addPolicy(createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
      }));

      const chain = await store.getPolicyChain('myorg', 'myorg/myrepo');
      expect(chain).toHaveLength(2);
      expect(chain.map(p => p.name)).toEqual(['global-policy', 'repo-policy']);
    });
  });

  describe('clear', () => {
    it('should remove all policies', async () => {
      store.addPolicy(createTestPolicy({ name: 'policy-1', scope: 'global', scopeTarget: 'default' }));
      store.addPolicy(createTestPolicy({ name: 'policy-2', scope: 'org', scopeTarget: 'org' }));

      store.clear();

      const globalPolicies = await store.getPoliciesForScope('global', 'default');
      expect(globalPolicies).toHaveLength(0);
    });
  });
});

// =============================================================================
// PolicyInheritanceResolver Tests
// =============================================================================

describe('PolicyInheritanceResolver', () => {
  let store: InMemoryPolicyStore;
  let resolver: PolicyInheritanceResolver;

  beforeEach(() => {
    const result = createInheritanceResolver();
    store = result.store;
    resolver = result.resolver;
  });

  describe('resolve (empty)', () => {
    it('should return empty policy when no policies exist', async () => {
      const result = await resolver.resolve('myorg', 'myorg/myrepo');

      expect(result.policy.name).toBe('empty');
      expect(result.policy.rules).toHaveLength(0);
      expect(result.chain).toHaveLength(0);
      expect(result.metadata.chainDepth).toBe(0);
    });
  });

  describe('resolve (single policy)', () => {
    it('should return single policy unchanged', async () => {
      const policy = createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
        rules: [
          createTestRule({ id: 'rule-1', name: 'Rule 1' }),
          createTestRule({ id: 'rule-2', name: 'Rule 2' }),
        ],
      });
      store.addPolicy(policy);

      const result = await resolver.resolve('myorg', 'myorg/myrepo');

      expect(result.policy.rules).toHaveLength(2);
      expect(result.chain).toHaveLength(1);
      expect(result.ruleOrigins.get('rule-1')).toBe('repo-policy');
    });
  });

  describe('merge strategy: replace', () => {
    it('should completely replace parent policy', async () => {
      store.addPolicy(createTestPolicy({
        name: 'global-policy',
        scope: 'global',
        scopeTarget: 'default',
        rules: [
          createTestRule({ id: 'global-rule', name: 'Global Rule' }),
        ],
      }));

      store.addPolicy(createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
        inheritance: 'replace',
        rules: [
          createTestRule({ id: 'repo-rule', name: 'Repo Rule' }),
        ],
      }));

      const result = await resolver.resolve('myorg', 'myorg/myrepo');

      expect(result.policy.rules).toHaveLength(1);
      expect(result.policy.rules[0].id).toBe('repo-rule');
      expect(result.ruleOrigins.has('global-rule')).toBe(false);
    });
  });

  describe('merge strategy: extend', () => {
    it('should add child rules without overriding parent', async () => {
      store.addPolicy(createTestPolicy({
        name: 'global-policy',
        scope: 'global',
        scopeTarget: 'default',
        rules: [
          createTestRule({ id: 'shared-rule', name: 'Shared Rule', priority: 10 }),
          createTestRule({ id: 'global-only', name: 'Global Only' }),
        ],
      }));

      store.addPolicy(createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
        inheritance: 'extend',
        rules: [
          createTestRule({ id: 'shared-rule', name: 'Repo Version', priority: 20 }),
          createTestRule({ id: 'repo-only', name: 'Repo Only' }),
        ],
      }));

      const result = await resolver.resolve('myorg', 'myorg/myrepo');

      expect(result.policy.rules).toHaveLength(3);

      // shared-rule should be parent's version (extend doesn't override)
      const sharedRule = result.policy.rules.find(r => r.id === 'shared-rule');
      expect(sharedRule?.priority).toBe(10); // Parent's priority
      expect(result.ruleOrigins.get('shared-rule')).toBe('global-policy');

      // repo-only should be added
      expect(result.policy.rules.some(r => r.id === 'repo-only')).toBe(true);
    });
  });

  describe('merge strategy: override (default)', () => {
    it('should let child rules override parent rules', async () => {
      store.addPolicy(createTestPolicy({
        name: 'global-policy',
        scope: 'global',
        scopeTarget: 'default',
        rules: [
          createTestRule({ id: 'shared-rule', name: 'Global Version', priority: 10 }),
          createTestRule({ id: 'global-only', name: 'Global Only' }),
        ],
      }));

      store.addPolicy(createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
        inheritance: 'override', // default
        rules: [
          createTestRule({ id: 'shared-rule', name: 'Repo Version', priority: 20 }),
          createTestRule({ id: 'repo-only', name: 'Repo Only' }),
        ],
      }));

      const result = await resolver.resolve('myorg', 'myorg/myrepo');

      expect(result.policy.rules).toHaveLength(3);

      // shared-rule should be child's version (override)
      const sharedRule = result.policy.rules.find(r => r.id === 'shared-rule');
      expect(sharedRule?.priority).toBe(20); // Child's priority
      expect(result.ruleOrigins.get('shared-rule')).toBe('repo-policy');

      // global-only should still exist (not overridden)
      expect(result.policy.rules.some(r => r.id === 'global-only')).toBe(true);
      expect(result.ruleOrigins.get('global-only')).toBe('global-policy');
    });
  });

  describe('multi-level inheritance', () => {
    it('should resolve 4-level chain correctly', async () => {
      store.addPolicy(createTestPolicy({
        name: 'global-policy',
        scope: 'global',
        scopeTarget: 'default',
        rules: [
          createTestRule({ id: 'global-rule', name: 'Global', priority: 100 }),
        ],
      }));

      store.addPolicy(createTestPolicy({
        name: 'org-policy',
        scope: 'org',
        scopeTarget: 'myorg',
        inheritance: 'extend',
        rules: [
          createTestRule({ id: 'org-rule', name: 'Org', priority: 90 }),
        ],
      }));

      store.addPolicy(createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
        inheritance: 'override',
        rules: [
          createTestRule({ id: 'global-rule', name: 'Repo Override', priority: 80 }),
          createTestRule({ id: 'repo-rule', name: 'Repo', priority: 70 }),
        ],
      }));

      store.addPolicy(createTestPolicy({
        name: 'branch-policy',
        scope: 'branch',
        scopeTarget: 'main',
        inheritance: 'extend',
        rules: [
          createTestRule({ id: 'branch-rule', name: 'Branch', priority: 60 }),
        ],
      }));

      const result = await resolver.resolve('myorg', 'myorg/myrepo', 'main');

      expect(result.chain).toHaveLength(4);
      expect(result.metadata.chainDepth).toBe(4);

      // Should have 4 rules total
      expect(result.policy.rules).toHaveLength(4);

      // Check rule origins
      expect(result.ruleOrigins.get('global-rule')).toBe('repo-policy'); // Overridden
      expect(result.ruleOrigins.get('org-rule')).toBe('org-policy');
      expect(result.ruleOrigins.get('repo-rule')).toBe('repo-policy');
      expect(result.ruleOrigins.get('branch-rule')).toBe('branch-policy');

      // Rules should be sorted by priority (descending: 90, 80, 70, 60)
      const priorities = result.policy.rules.map(r => r.priority);
      expect(priorities).toEqual([90, 80, 70, 60]); // Sorted descending
    });
  });

  describe('resolvePolicy', () => {
    it('should resolve policy by ID with parent chain', async () => {
      const parentPolicy = createTestPolicy({
        name: 'parent-policy',
        scope: 'org',
        scopeTarget: 'myorg',
        rules: [
          createTestRule({ id: 'parent-rule', name: 'Parent' }),
        ],
      });
      store.addPolicy(parentPolicy);

      const childPolicy = createTestPolicy({
        name: 'child-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
        parentPolicyId: 'org:myorg:parent-policy',
        inheritance: 'override',
        rules: [
          createTestRule({ id: 'child-rule', name: 'Child' }),
        ],
      });
      store.addPolicy(childPolicy);

      const result = await resolver.resolvePolicy('repo:myorg/myrepo:child-policy');

      expect(result).not.toBeNull();
      expect(result!.chain).toHaveLength(2);
      expect(result!.policy.rules).toHaveLength(2);
    });

    it('should return null for non-existent policy', async () => {
      const result = await resolver.resolvePolicy('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('metadata', () => {
    it('should track merge statistics', async () => {
      store.addPolicy(createTestPolicy({
        name: 'global-policy',
        scope: 'global',
        scopeTarget: 'default',
        rules: [
          createTestRule({ id: 'rule-1', name: 'Rule 1' }),
          createTestRule({ id: 'rule-2', name: 'Rule 2' }),
        ],
      }));

      store.addPolicy(createTestPolicy({
        name: 'repo-policy',
        scope: 'repo',
        scopeTarget: 'myorg/myrepo',
        inheritance: 'override',
        rules: [
          createTestRule({ id: 'rule-2', name: 'Override' }), // Overrides
          createTestRule({ id: 'rule-3', name: 'Rule 3' }),   // New
        ],
      }));

      const result = await resolver.resolve('myorg', 'myorg/myrepo');

      expect(result.metadata.totalRulesBeforeMerge).toBe(4);
      expect(result.metadata.totalRulesAfterMerge).toBe(3); // rule-2 merged
      expect(result.metadata.resolvedAt).toBeInstanceOf(Date);
    });
  });
});

// =============================================================================
// createInheritanceResolver Helper Tests
// =============================================================================

describe('createInheritanceResolver', () => {
  it('should create resolver with in-memory store', () => {
    const { resolver, store } = createInheritanceResolver();

    expect(resolver).toBeInstanceOf(PolicyInheritanceResolver);
    expect(store).toBeInstanceOf(InMemoryPolicyStore);
  });
});
