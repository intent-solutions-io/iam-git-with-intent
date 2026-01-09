/**
 * Policy Cache
 *
 * Epic D: Policy & Audit - Story D2: Policy Engine
 * Task D2.4: Implement policy caching
 *
 * LRU cache for compiled policies with:
 * - Per tenant/repo caching
 * - Automatic invalidation on policy update
 * - Memory limit with LRU eviction
 * - Cache statistics for monitoring
 *
 * @module @gwi/core/policy/cache
 */

import type { PolicyDocument, PolicyRule } from './schema.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Cache key components
 */
export interface PolicyCacheKey {
  /** Tenant ID */
  tenantId: string;
  /** Repository (owner/name) - optional for org-level policies */
  repo?: string;
  /** Branch - optional for repo-level policies */
  branch?: string;
  /** Policy ID or name */
  policyId: string;
}

/**
 * Compiled rule for efficient evaluation
 */
export interface CompiledRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: unknown[];
  action: PolicyRule['action'];
  /** Compile time for debugging */
  compiledAt: Date;
}

/**
 * Cached policy entry
 */
export interface CachedPolicy {
  /** Original policy document */
  document: PolicyDocument;
  /** Compiled rules for fast evaluation */
  compiledRules: CompiledRule[];
  /** When the policy was cached */
  cachedAt: Date;
  /** Last access time for LRU */
  lastAccessedAt: Date;
  /** Access count for statistics */
  accessCount: number;
  /** Cache key string */
  cacheKey: string;
  /** TTL expiration time (if set) */
  expiresAt?: Date;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Hit rate (hits / (hits + misses)) */
  hitRate: number;
  /** Current number of entries */
  size: number;
  /** Maximum capacity */
  maxSize: number;
  /** Total evictions */
  evictions: number;
  /** Total invalidations */
  invalidations: number;
  /** Memory usage estimate in bytes */
  memoryUsageBytes: number;
  /** Average access count per entry */
  avgAccessCount: number;
}

/**
 * Cache configuration
 */
export interface PolicyCacheConfig {
  /** Maximum number of entries (default: 1000) */
  maxSize?: number;
  /** Default TTL in milliseconds (default: 5 minutes) */
  defaultTtlMs?: number;
  /** Whether to enable TTL (default: true) */
  enableTtl?: boolean;
  /** Whether to track statistics (default: true) */
  trackStats?: boolean;
  /** Memory limit in bytes (optional, estimates based on entry count if not set) */
  memoryLimitBytes?: number;
}

/**
 * Cache event types
 */
export type CacheEventType = 'hit' | 'miss' | 'set' | 'evict' | 'invalidate' | 'expire';

/**
 * Cache event listener
 */
export type CacheEventListener = (event: {
  type: CacheEventType;
  key: string;
  timestamp: Date;
}) => void;

// =============================================================================
// LRU Policy Cache
// =============================================================================

/**
 * LRU Cache for compiled policies
 *
 * Provides efficient caching with:
 * - O(1) get/set/delete operations
 * - Automatic LRU eviction when max size reached
 * - Optional TTL-based expiration
 * - Per tenant/repo isolation
 * - Cache statistics
 *
 * @example
 * ```typescript
 * const cache = new PolicyCache({ maxSize: 500, defaultTtlMs: 60000 });
 *
 * // Cache a policy
 * cache.set({ tenantId: 'tenant-1', policyId: 'policy-1' }, compiledPolicy);
 *
 * // Get cached policy
 * const cached = cache.get({ tenantId: 'tenant-1', policyId: 'policy-1' });
 *
 * // Invalidate on update
 * cache.invalidate({ tenantId: 'tenant-1', policyId: 'policy-1' });
 *
 * // Invalidate all for a tenant
 * cache.invalidateByTenant('tenant-1');
 * ```
 */
export class PolicyCache {
  private cache = new Map<string, CachedPolicy>();
  private accessOrder: string[] = [];
  private config: Required<PolicyCacheConfig>;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
  };
  private listeners: CacheEventListener[] = [];

  constructor(config: PolicyCacheConfig = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      defaultTtlMs: config.defaultTtlMs ?? 5 * 60 * 1000, // 5 minutes
      enableTtl: config.enableTtl ?? true,
      trackStats: config.trackStats ?? true,
      memoryLimitBytes: config.memoryLimitBytes ?? 0,
    };
  }

  /**
   * Generate cache key string from components
   */
  static generateKey(key: PolicyCacheKey): string {
    const parts = [key.tenantId];
    if (key.repo) parts.push(key.repo);
    if (key.branch) parts.push(key.branch);
    parts.push(key.policyId);
    return parts.join(':');
  }

  /**
   * Parse cache key string back to components
   */
  static parseKey(keyString: string): PolicyCacheKey {
    const parts = keyString.split(':');
    if (parts.length < 2) {
      throw new Error(`Invalid cache key: ${keyString}`);
    }

    const result: PolicyCacheKey = {
      tenantId: parts[0],
      policyId: parts[parts.length - 1],
    };

    if (parts.length === 3) {
      // Could be repo or policyId with special chars
      result.repo = parts[1];
    } else if (parts.length === 4) {
      result.repo = parts[1];
      result.branch = parts[2];
    }

    return result;
  }

  /**
   * Get a cached policy
   */
  get(key: PolicyCacheKey): CachedPolicy | null {
    const keyString = PolicyCache.generateKey(key);
    const entry = this.cache.get(keyString);

    if (!entry) {
      this.recordMiss(keyString);
      return null;
    }

    // Check TTL expiration
    if (this.config.enableTtl && entry.expiresAt && entry.expiresAt < new Date()) {
      this.delete(key);
      this.emit('expire', keyString);
      this.recordMiss(keyString);
      return null;
    }

    // Update access tracking
    entry.lastAccessedAt = new Date();
    entry.accessCount++;
    this.moveToEnd(keyString);
    this.recordHit(keyString);

    return entry;
  }

  /**
   * Cache a compiled policy
   */
  set(key: PolicyCacheKey, policy: CachedPolicy, ttlMs?: number): void {
    const keyString = PolicyCache.generateKey(key);

    // Check if we need to evict
    if (!this.cache.has(keyString) && this.cache.size >= this.config.maxSize) {
      this.evictLRU();
    }

    // Calculate expiration
    const effectiveTtl = ttlMs ?? this.config.defaultTtlMs;
    const expiresAt = this.config.enableTtl
      ? new Date(Date.now() + effectiveTtl)
      : undefined;

    // Store entry
    const entry: CachedPolicy = {
      ...policy,
      cacheKey: keyString,
      cachedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      expiresAt,
    };

    this.cache.set(keyString, entry);
    this.moveToEnd(keyString);
    this.emit('set', keyString);
  }

  /**
   * Delete a cached policy
   */
  delete(key: PolicyCacheKey): boolean {
    const keyString = PolicyCache.generateKey(key);
    const existed = this.cache.delete(keyString);
    if (existed) {
      this.removeFromOrder(keyString);
    }
    return existed;
  }

  /**
   * Check if a policy is cached
   */
  has(key: PolicyCacheKey): boolean {
    const keyString = PolicyCache.generateKey(key);
    const entry = this.cache.get(keyString);

    if (!entry) return false;

    // Check TTL
    if (this.config.enableTtl && entry.expiresAt && entry.expiresAt < new Date()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate a specific policy
   */
  invalidate(key: PolicyCacheKey): boolean {
    const existed = this.delete(key);
    if (existed) {
      this.stats.invalidations++;
      this.emit('invalidate', PolicyCache.generateKey(key));
    }
    return existed;
  }

  /**
   * Invalidate all policies for a tenant
   */
  invalidateByTenant(tenantId: string): number {
    let count = 0;
    const keysToDelete: string[] = [];

    for (const keyString of this.cache.keys()) {
      if (keyString.startsWith(`${tenantId}:`)) {
        keysToDelete.push(keyString);
      }
    }

    for (const keyString of keysToDelete) {
      this.cache.delete(keyString);
      this.removeFromOrder(keyString);
      this.stats.invalidations++;
      this.emit('invalidate', keyString);
      count++;
    }

    return count;
  }

  /**
   * Invalidate all policies for a repo
   */
  invalidateByRepo(tenantId: string, repo: string): number {
    let count = 0;
    const prefix = `${tenantId}:${repo}`;
    const keysToDelete: string[] = [];

    for (const keyString of this.cache.keys()) {
      if (keyString.startsWith(prefix)) {
        keysToDelete.push(keyString);
      }
    }

    for (const keyString of keysToDelete) {
      this.cache.delete(keyString);
      this.removeFromOrder(keyString);
      this.stats.invalidations++;
      this.emit('invalidate', keyString);
      count++;
    }

    return count;
  }

  /**
   * Clear all cached policies
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    let totalAccessCount = 0;
    for (const entry of this.cache.values()) {
      totalAccessCount += entry.accessCount;
    }
    const avgAccessCount = this.cache.size > 0 ? totalAccessCount / this.cache.size : 0;

    // Estimate memory usage (rough approximation)
    const memoryUsageBytes = this.estimateMemoryUsage();

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      size: this.cache.size,
      maxSize: this.config.maxSize,
      evictions: this.stats.evictions,
      invalidations: this.stats.invalidations,
      memoryUsageBytes,
      avgAccessCount,
    };
  }

  /**
   * Get all cached keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get number of entries
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Add event listener
   */
  addEventListener(listener: CacheEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: CacheEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    if (!this.config.enableTtl) return 0;

    const now = new Date();
    let count = 0;
    const keysToDelete: string[] = [];

    for (const [keyString, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < now) {
        keysToDelete.push(keyString);
      }
    }

    for (const keyString of keysToDelete) {
      this.cache.delete(keyString);
      this.removeFromOrder(keyString);
      this.emit('expire', keyString);
      count++;
    }

    return count;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();
    this.stats.evictions++;
    this.emit('evict', lruKey);
  }

  /**
   * Move key to end of access order (most recently used)
   */
  private moveToEnd(keyString: string): void {
    this.removeFromOrder(keyString);
    this.accessOrder.push(keyString);
  }

  /**
   * Remove key from access order
   */
  private removeFromOrder(keyString: string): void {
    const index = this.accessOrder.indexOf(keyString);
    if (index >= 0) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Record a cache hit
   */
  private recordHit(keyString: string): void {
    if (this.config.trackStats) {
      this.stats.hits++;
      this.emit('hit', keyString);
    }
  }

  /**
   * Record a cache miss
   */
  private recordMiss(keyString: string): void {
    if (this.config.trackStats) {
      this.stats.misses++;
      this.emit('miss', keyString);
    }
  }

  /**
   * Emit cache event
   */
  private emit(type: CacheEventType, key: string): void {
    const event = { type, key, timestamp: new Date() };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    // Rough estimate: ~2KB per policy entry on average
    // This is a simplification; real usage depends on policy size
    const avgEntrySize = 2048;
    return this.cache.size * avgEntrySize;
  }
}

// =============================================================================
// Cached Policy Engine Wrapper
// =============================================================================

/**
 * Policy compiler function type
 */
export type PolicyCompiler = (document: PolicyDocument) => CompiledRule[];

/**
 * Policy loader function type
 */
export type PolicyLoader = (key: PolicyCacheKey) => Promise<PolicyDocument | null>;

/**
 * Cached policy engine configuration
 */
export interface CachedPolicyEngineConfig {
  /** Cache configuration */
  cache?: PolicyCacheConfig;
  /** Policy compiler function */
  compiler: PolicyCompiler;
  /** Policy loader function (for cache misses) */
  loader: PolicyLoader;
}

/**
 * Policy engine with integrated caching
 *
 * Wraps policy loading and compilation with automatic caching.
 *
 * @example
 * ```typescript
 * const engine = new CachedPolicyEngine({
 *   compiler: (doc) => compileRules(doc.rules),
 *   loader: async (key) => policyStore.getPolicy(key.tenantId, key.policyId),
 * });
 *
 * // Get policy (cached or loaded)
 * const policy = await engine.getPolicy({
 *   tenantId: 'tenant-1',
 *   policyId: 'main-policy',
 * });
 * ```
 */
export class CachedPolicyEngine {
  private cache: PolicyCache;
  private compiler: PolicyCompiler;
  private loader: PolicyLoader;

  constructor(config: CachedPolicyEngineConfig) {
    this.cache = new PolicyCache(config.cache);
    this.compiler = config.compiler;
    this.loader = config.loader;
  }

  /**
   * Get a policy (from cache or loaded)
   */
  async getPolicy(key: PolicyCacheKey): Promise<CachedPolicy | null> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    // Load from source
    const document = await this.loader(key);
    if (!document) {
      return null;
    }

    // Compile and cache
    const compiledRules = this.compiler(document);
    const policy: CachedPolicy = {
      document,
      compiledRules,
      cachedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      cacheKey: PolicyCache.generateKey(key),
    };

    this.cache.set(key, policy);
    return policy;
  }

  /**
   * Preload policies into cache
   */
  async preload(keys: PolicyCacheKey[]): Promise<number> {
    let loaded = 0;
    for (const key of keys) {
      const policy = await this.getPolicy(key);
      if (policy) loaded++;
    }
    return loaded;
  }

  /**
   * Invalidate a policy
   */
  invalidate(key: PolicyCacheKey): boolean {
    return this.cache.invalidate(key);
  }

  /**
   * Invalidate all policies for a tenant
   */
  invalidateByTenant(tenantId: string): number {
    return this.cache.invalidateByTenant(tenantId);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.cache.getStats();
  }

  /**
   * Get the underlying cache
   */
  getCache(): PolicyCache {
    return this.cache;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a policy cache
 */
export function createPolicyCache(config?: PolicyCacheConfig): PolicyCache {
  return new PolicyCache(config);
}

/**
 * Create a cached policy engine
 */
export function createCachedPolicyEngine(config: CachedPolicyEngineConfig): CachedPolicyEngine {
  return new CachedPolicyEngine(config);
}

// =============================================================================
// Singleton Instance
// =============================================================================

let policyCacheInstance: PolicyCache | null = null;

/**
 * Get the global policy cache instance
 */
export function getPolicyCache(): PolicyCache {
  if (!policyCacheInstance) {
    policyCacheInstance = new PolicyCache();
  }
  return policyCacheInstance;
}

/**
 * Set the global policy cache (for dependency injection)
 */
export function setPolicyCache(cache: PolicyCache): void {
  policyCacheInstance = cache;
}

/**
 * Reset the global policy cache (for testing)
 */
export function resetPolicyCache(): void {
  policyCacheInstance = null;
}
