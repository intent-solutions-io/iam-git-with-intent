/**
 * Policy Cache Tests
 *
 * Epic D: Policy & Audit - Story D2: Policy Engine
 * Task D2.4: Implement policy caching
 *
 * Tests for LRU cache, invalidation, TTL, and CachedPolicyEngine.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  PolicyCache,
  PolicyCacheKey,
  CachedPolicy,
  CacheStats,
  CachedPolicyEngine,
  createPolicyCache,
  createCachedPolicyEngine,
  getPolicyCache,
  setPolicyCache,
  resetPolicyCache,
} from '../cache.js';
import type { PolicyDocument, PolicyRule } from '../schema.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockPolicyDocument(id: string): PolicyDocument {
  return {
    version: '1.0' as const,
    metadata: {
      id,
      name: `Policy ${id}`,
      description: `Test policy ${id}`,
      scope: 'repository' as const,
    },
    rules: [
      {
        id: `rule-${id}`,
        name: `Rule ${id}`,
        enabled: true,
        conditions: [
          {
            type: 'complexity' as const,
            operator: '>' as const,
            value: 5,
          },
        ],
        action: {
          effect: 'require_approval' as const,
          message: `Approval required for ${id}`,
        },
      },
    ],
  };
}

function createMockCachedPolicy(id: string): CachedPolicy {
  const doc = createMockPolicyDocument(id);
  return {
    document: doc,
    compiledRules: doc.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      priority: 0,
      conditions: rule.conditions,
      action: rule.action,
      compiledAt: new Date(),
    })),
    cachedAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 0,
    cacheKey: '',
  };
}

// =============================================================================
// PolicyCache.generateKey Tests
// =============================================================================

describe('PolicyCache.generateKey', () => {
  it('should generate key with tenantId and policyId', () => {
    const key: PolicyCacheKey = {
      tenantId: 'tenant-1',
      policyId: 'policy-1',
    };
    expect(PolicyCache.generateKey(key)).toBe('tenant-1:policy-1');
  });

  it('should include repo in key', () => {
    const key: PolicyCacheKey = {
      tenantId: 'tenant-1',
      repo: 'owner/repo',
      policyId: 'policy-1',
    };
    expect(PolicyCache.generateKey(key)).toBe('tenant-1:owner/repo:policy-1');
  });

  it('should include branch in key', () => {
    const key: PolicyCacheKey = {
      tenantId: 'tenant-1',
      repo: 'owner/repo',
      branch: 'main',
      policyId: 'policy-1',
    };
    expect(PolicyCache.generateKey(key)).toBe('tenant-1:owner/repo:main:policy-1');
  });
});

describe('PolicyCache.parseKey', () => {
  it('should parse simple key', () => {
    const parsed = PolicyCache.parseKey('tenant-1:policy-1');
    expect(parsed.tenantId).toBe('tenant-1');
    expect(parsed.policyId).toBe('policy-1');
    expect(parsed.repo).toBeUndefined();
    expect(parsed.branch).toBeUndefined();
  });

  it('should parse key with repo', () => {
    const parsed = PolicyCache.parseKey('tenant-1:owner/repo:policy-1');
    expect(parsed.tenantId).toBe('tenant-1');
    expect(parsed.repo).toBe('owner/repo');
    expect(parsed.policyId).toBe('policy-1');
  });

  it('should parse key with repo and branch', () => {
    const parsed = PolicyCache.parseKey('tenant-1:owner/repo:main:policy-1');
    expect(parsed.tenantId).toBe('tenant-1');
    expect(parsed.repo).toBe('owner/repo');
    expect(parsed.branch).toBe('main');
    expect(parsed.policyId).toBe('policy-1');
  });

  it('should throw on invalid key', () => {
    expect(() => PolicyCache.parseKey('single')).toThrow('Invalid cache key');
  });
});

// =============================================================================
// PolicyCache Basic Operations Tests
// =============================================================================

describe('PolicyCache', () => {
  let cache: PolicyCache;

  beforeEach(() => {
    cache = new PolicyCache({ maxSize: 5, enableTtl: false });
  });

  describe('set and get', () => {
    it('should cache and retrieve a policy', () => {
      const key: PolicyCacheKey = { tenantId: 'tenant-1', policyId: 'policy-1' };
      const policy = createMockCachedPolicy('1');

      cache.set(key, policy);
      const retrieved = cache.get(key);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.document.metadata.id).toBe('1');
    });

    it('should return null for missing policy', () => {
      const key: PolicyCacheKey = { tenantId: 'tenant-1', policyId: 'nonexistent' };
      expect(cache.get(key)).toBeNull();
    });

    it('should update access count on get', () => {
      const key: PolicyCacheKey = { tenantId: 'tenant-1', policyId: 'policy-1' };
      const policy = createMockCachedPolicy('1');

      cache.set(key, policy);
      cache.get(key);
      cache.get(key);
      const retrieved = cache.get(key);

      expect(retrieved?.accessCount).toBe(3);
    });
  });

  describe('has', () => {
    it('should return true for cached policy', () => {
      const key: PolicyCacheKey = { tenantId: 'tenant-1', policyId: 'policy-1' };
      cache.set(key, createMockCachedPolicy('1'));
      expect(cache.has(key)).toBe(true);
    });

    it('should return false for missing policy', () => {
      const key: PolicyCacheKey = { tenantId: 'tenant-1', policyId: 'nonexistent' };
      expect(cache.has(key)).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete cached policy', () => {
      const key: PolicyCacheKey = { tenantId: 'tenant-1', policyId: 'policy-1' };
      cache.set(key, createMockCachedPolicy('1'));

      expect(cache.delete(key)).toBe(true);
      expect(cache.has(key)).toBe(false);
    });

    it('should return false for non-existent policy', () => {
      const key: PolicyCacheKey = { tenantId: 'tenant-1', policyId: 'nonexistent' };
      expect(cache.delete(key)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
      cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2'));

      cache.clear();

      expect(cache.size).toBe(0);
    });
  });

  describe('size', () => {
    it('should return current cache size', () => {
      expect(cache.size).toBe(0);

      cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
      expect(cache.size).toBe(1);

      cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2'));
      expect(cache.size).toBe(2);
    });
  });

  describe('keys', () => {
    it('should return all cached keys', () => {
      cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
      cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2'));

      const keys = cache.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContain('t1:p1');
      expect(keys).toContain('t1:p2');
    });
  });
});

// =============================================================================
// LRU Eviction Tests
// =============================================================================

describe('PolicyCache LRU Eviction', () => {
  it('should evict least recently used when at capacity', () => {
    const cache = new PolicyCache({ maxSize: 3, enableTtl: false });

    cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
    cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2'));
    cache.set({ tenantId: 't1', policyId: 'p3' }, createMockCachedPolicy('3'));

    // p1 is LRU, should be evicted
    cache.set({ tenantId: 't1', policyId: 'p4' }, createMockCachedPolicy('4'));

    expect(cache.size).toBe(3);
    expect(cache.has({ tenantId: 't1', policyId: 'p1' })).toBe(false);
    expect(cache.has({ tenantId: 't1', policyId: 'p4' })).toBe(true);
  });

  it('should update LRU order on access', () => {
    const cache = new PolicyCache({ maxSize: 3, enableTtl: false });

    cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
    cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2'));
    cache.set({ tenantId: 't1', policyId: 'p3' }, createMockCachedPolicy('3'));

    // Access p1 to make it most recently used
    cache.get({ tenantId: 't1', policyId: 'p1' });

    // p2 is now LRU, should be evicted
    cache.set({ tenantId: 't1', policyId: 'p4' }, createMockCachedPolicy('4'));

    expect(cache.has({ tenantId: 't1', policyId: 'p1' })).toBe(true); // accessed, not evicted
    expect(cache.has({ tenantId: 't1', policyId: 'p2' })).toBe(false); // evicted
  });

  it('should track eviction count in stats', () => {
    const cache = new PolicyCache({ maxSize: 2, enableTtl: false });

    cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
    cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2'));
    cache.set({ tenantId: 't1', policyId: 'p3' }, createMockCachedPolicy('3'));
    cache.set({ tenantId: 't1', policyId: 'p4' }, createMockCachedPolicy('4'));

    const stats = cache.getStats();
    expect(stats.evictions).toBe(2);
  });
});

// =============================================================================
// TTL Tests
// =============================================================================

describe('PolicyCache TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should expire entries after TTL', () => {
    const cache = new PolicyCache({ maxSize: 10, enableTtl: true, defaultTtlMs: 1000 });
    const key: PolicyCacheKey = { tenantId: 't1', policyId: 'p1' };

    cache.set(key, createMockCachedPolicy('1'));
    expect(cache.get(key)).not.toBeNull();

    // Advance time past TTL
    vi.advanceTimersByTime(1500);

    expect(cache.get(key)).toBeNull();
  });

  it('should respect custom TTL per entry', () => {
    const cache = new PolicyCache({ maxSize: 10, enableTtl: true, defaultTtlMs: 5000 });

    const key1: PolicyCacheKey = { tenantId: 't1', policyId: 'p1' };
    const key2: PolicyCacheKey = { tenantId: 't1', policyId: 'p2' };

    cache.set(key1, createMockCachedPolicy('1'), 1000); // 1 second TTL
    cache.set(key2, createMockCachedPolicy('2'), 10000); // 10 second TTL

    vi.advanceTimersByTime(2000);

    expect(cache.get(key1)).toBeNull(); // expired
    expect(cache.get(key2)).not.toBeNull(); // still valid
  });

  it('should prune expired entries', () => {
    const cache = new PolicyCache({ maxSize: 10, enableTtl: true, defaultTtlMs: 1000 });

    cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
    cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2'));

    vi.advanceTimersByTime(2000);

    const pruned = cache.prune();
    expect(pruned).toBe(2);
    expect(cache.size).toBe(0);
  });

  it('should not expire when TTL disabled', () => {
    const cache = new PolicyCache({ maxSize: 10, enableTtl: false });
    const key: PolicyCacheKey = { tenantId: 't1', policyId: 'p1' };

    cache.set(key, createMockCachedPolicy('1'));

    vi.advanceTimersByTime(100000);

    expect(cache.get(key)).not.toBeNull();
  });
});

// =============================================================================
// Invalidation Tests
// =============================================================================

describe('PolicyCache Invalidation', () => {
  let cache: PolicyCache;

  beforeEach(() => {
    cache = new PolicyCache({ maxSize: 100, enableTtl: false });
  });

  describe('invalidate', () => {
    it('should invalidate specific policy', () => {
      const key: PolicyCacheKey = { tenantId: 't1', policyId: 'p1' };
      cache.set(key, createMockCachedPolicy('1'));

      expect(cache.invalidate(key)).toBe(true);
      expect(cache.has(key)).toBe(false);
    });

    it('should track invalidation count', () => {
      cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
      cache.invalidate({ tenantId: 't1', policyId: 'p1' });

      expect(cache.getStats().invalidations).toBe(1);
    });
  });

  describe('invalidateByTenant', () => {
    it('should invalidate all policies for tenant', () => {
      cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
      cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2'));
      cache.set({ tenantId: 't1', repo: 'r1', policyId: 'p3' }, createMockCachedPolicy('3'));
      cache.set({ tenantId: 't2', policyId: 'p4' }, createMockCachedPolicy('4'));

      const count = cache.invalidateByTenant('t1');

      expect(count).toBe(3);
      expect(cache.has({ tenantId: 't1', policyId: 'p1' })).toBe(false);
      expect(cache.has({ tenantId: 't1', policyId: 'p2' })).toBe(false);
      expect(cache.has({ tenantId: 't1', repo: 'r1', policyId: 'p3' })).toBe(false);
      expect(cache.has({ tenantId: 't2', policyId: 'p4' })).toBe(true); // not invalidated
    });
  });

  describe('invalidateByRepo', () => {
    it('should invalidate all policies for repo', () => {
      cache.set({ tenantId: 't1', repo: 'r1', policyId: 'p1' }, createMockCachedPolicy('1'));
      cache.set({ tenantId: 't1', repo: 'r1', branch: 'main', policyId: 'p2' }, createMockCachedPolicy('2'));
      cache.set({ tenantId: 't1', repo: 'r2', policyId: 'p3' }, createMockCachedPolicy('3'));

      const count = cache.invalidateByRepo('t1', 'r1');

      expect(count).toBe(2);
      expect(cache.has({ tenantId: 't1', repo: 'r1', policyId: 'p1' })).toBe(false);
      expect(cache.has({ tenantId: 't1', repo: 'r1', branch: 'main', policyId: 'p2' })).toBe(false);
      expect(cache.has({ tenantId: 't1', repo: 'r2', policyId: 'p3' })).toBe(true); // not invalidated
    });
  });
});

// =============================================================================
// Statistics Tests
// =============================================================================

describe('PolicyCache Statistics', () => {
  it('should track hits and misses', () => {
    const cache = new PolicyCache({ maxSize: 10, enableTtl: false });
    const key: PolicyCacheKey = { tenantId: 't1', policyId: 'p1' };

    // Miss
    cache.get(key);

    // Set
    cache.set(key, createMockCachedPolicy('1'));

    // Hit
    cache.get(key);
    cache.get(key);

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it('should calculate average access count', () => {
    const cache = new PolicyCache({ maxSize: 10, enableTtl: false });

    cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
    cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2'));

    // Access p1 three times
    cache.get({ tenantId: 't1', policyId: 'p1' });
    cache.get({ tenantId: 't1', policyId: 'p1' });
    cache.get({ tenantId: 't1', policyId: 'p1' });

    // Access p2 once
    cache.get({ tenantId: 't1', policyId: 'p2' });

    const stats = cache.getStats();
    expect(stats.avgAccessCount).toBe(2); // (3 + 1) / 2
  });

  it('should estimate memory usage', () => {
    const cache = new PolicyCache({ maxSize: 10, enableTtl: false });

    cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
    cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2'));

    const stats = cache.getStats();
    expect(stats.memoryUsageBytes).toBeGreaterThan(0);
    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(10);
  });
});

// =============================================================================
// Event Listener Tests
// =============================================================================

describe('PolicyCache Events', () => {
  it('should emit events for cache operations', () => {
    const cache = new PolicyCache({ maxSize: 2, enableTtl: false });
    const events: string[] = [];

    cache.addEventListener((event) => {
      events.push(event.type);
    });

    const key: PolicyCacheKey = { tenantId: 't1', policyId: 'p1' };

    cache.get(key); // miss
    cache.set(key, createMockCachedPolicy('1')); // set
    cache.get(key); // hit
    cache.invalidate(key); // invalidate

    expect(events).toContain('miss');
    expect(events).toContain('set');
    expect(events).toContain('hit');
    expect(events).toContain('invalidate');
  });

  it('should emit evict events', () => {
    const cache = new PolicyCache({ maxSize: 1, enableTtl: false });
    const events: string[] = [];

    cache.addEventListener((event) => {
      events.push(event.type);
    });

    cache.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));
    cache.set({ tenantId: 't1', policyId: 'p2' }, createMockCachedPolicy('2')); // triggers eviction

    expect(events).toContain('evict');
  });

  it('should remove event listener', () => {
    const cache = new PolicyCache({ maxSize: 10, enableTtl: false });
    const events: string[] = [];
    const listener = (event: { type: string }) => events.push(event.type);

    cache.addEventListener(listener);
    cache.get({ tenantId: 't1', policyId: 'p1' }); // miss
    cache.removeEventListener(listener);
    cache.get({ tenantId: 't1', policyId: 'p2' }); // miss but not recorded

    expect(events).toHaveLength(1);
  });
});

// =============================================================================
// CachedPolicyEngine Tests
// =============================================================================

describe('CachedPolicyEngine', () => {
  it('should load and cache policies', async () => {
    const loader = vi.fn().mockResolvedValue(createMockPolicyDocument('1'));
    const compiler = vi.fn().mockReturnValue([{ id: 'rule-1', name: 'Rule 1', enabled: true, priority: 0, conditions: [], action: { effect: 'allow' }, compiledAt: new Date() }]);

    const engine = createCachedPolicyEngine({
      cache: { maxSize: 10, enableTtl: false },
      compiler,
      loader,
    });

    const key: PolicyCacheKey = { tenantId: 't1', policyId: 'p1' };

    // First call loads
    const policy1 = await engine.getPolicy(key);
    expect(policy1).not.toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);

    // Second call uses cache
    const policy2 = await engine.getPolicy(key);
    expect(policy2).not.toBeNull();
    expect(loader).toHaveBeenCalledTimes(1); // not called again
  });

  it('should return null for missing policy', async () => {
    const loader = vi.fn().mockResolvedValue(null);
    const compiler = vi.fn();

    const engine = createCachedPolicyEngine({
      cache: { maxSize: 10 },
      compiler,
      loader,
    });

    const policy = await engine.getPolicy({ tenantId: 't1', policyId: 'missing' });
    expect(policy).toBeNull();
    expect(compiler).not.toHaveBeenCalled();
  });

  it('should preload multiple policies', async () => {
    const loader = vi.fn().mockResolvedValue(createMockPolicyDocument('1'));
    const compiler = vi.fn().mockReturnValue([]);

    const engine = createCachedPolicyEngine({
      cache: { maxSize: 10 },
      compiler,
      loader,
    });

    const keys: PolicyCacheKey[] = [
      { tenantId: 't1', policyId: 'p1' },
      { tenantId: 't1', policyId: 'p2' },
      { tenantId: 't1', policyId: 'p3' },
    ];

    const loaded = await engine.preload(keys);
    expect(loaded).toBe(3);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('should invalidate cached policy', async () => {
    const loader = vi.fn().mockResolvedValue(createMockPolicyDocument('1'));
    const compiler = vi.fn().mockReturnValue([]);

    const engine = createCachedPolicyEngine({
      cache: { maxSize: 10, enableTtl: false },
      compiler,
      loader,
    });

    const key: PolicyCacheKey = { tenantId: 't1', policyId: 'p1' };

    await engine.getPolicy(key);
    expect(loader).toHaveBeenCalledTimes(1);

    engine.invalidate(key);

    await engine.getPolicy(key);
    expect(loader).toHaveBeenCalledTimes(2); // reloaded
  });

  it('should expose cache stats', async () => {
    const loader = vi.fn().mockResolvedValue(createMockPolicyDocument('1'));
    const compiler = vi.fn().mockReturnValue([]);

    const engine = createCachedPolicyEngine({
      cache: { maxSize: 10 },
      compiler,
      loader,
    });

    await engine.getPolicy({ tenantId: 't1', policyId: 'p1' });
    await engine.getPolicy({ tenantId: 't1', policyId: 'p1' });

    const stats = engine.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should expose underlying cache', () => {
    const engine = createCachedPolicyEngine({
      cache: { maxSize: 10 },
      compiler: () => [],
      loader: async () => null,
    });

    const cache = engine.getCache();
    expect(cache).toBeInstanceOf(PolicyCache);
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('Factory Functions', () => {
  it('should create policy cache with createPolicyCache', () => {
    const cache = createPolicyCache({ maxSize: 50 });
    expect(cache).toBeInstanceOf(PolicyCache);
    expect(cache.getStats().maxSize).toBe(50);
  });

  it('should create cached engine with createCachedPolicyEngine', () => {
    const engine = createCachedPolicyEngine({
      compiler: () => [],
      loader: async () => null,
    });
    expect(engine).toBeInstanceOf(CachedPolicyEngine);
  });
});

// =============================================================================
// Singleton Tests
// =============================================================================

describe('Singleton Pattern', () => {
  afterEach(() => {
    resetPolicyCache();
  });

  it('should return same instance from getPolicyCache', () => {
    const cache1 = getPolicyCache();
    const cache2 = getPolicyCache();
    expect(cache1).toBe(cache2);
  });

  it('should allow setting custom cache', () => {
    const customCache = new PolicyCache({ maxSize: 999 });
    setPolicyCache(customCache);

    const cache = getPolicyCache();
    expect(cache.getStats().maxSize).toBe(999);
  });

  it('should reset singleton on resetPolicyCache', () => {
    const cache1 = getPolicyCache();
    cache1.set({ tenantId: 't1', policyId: 'p1' }, createMockCachedPolicy('1'));

    resetPolicyCache();

    const cache2 = getPolicyCache();
    expect(cache2.size).toBe(0);
    expect(cache2).not.toBe(cache1);
  });
});
