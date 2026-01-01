/**
 * Entity Resolver Tests
 *
 * Phase 35: Context Graph - Tests for cross-system identity resolution.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  type EntitySource,
  type EntityType,
  type EntityMention,
  type ResolvedEntity,
  InMemoryEntityResolverStore,
  EntityResolver,
  generateEntityId,
  createEntityResolver,
  getEntityResolverStore,
  setEntityResolverStore,
  resetEntityResolverStore,
} from '../entity-resolver.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestEntity(overrides?: Partial<ResolvedEntity>): ResolvedEntity {
  return {
    canonicalId: generateEntityId(),
    type: 'person',
    displayName: 'John Doe',
    mentions: [
      {
        source: 'github',
        identifier: 'johndoe',
        timestamp: new Date(),
      },
    ],
    confidence: 0.9,
    resolvedBy: 'exact-match',
    tenantId: 'tenant-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createTestMention(overrides?: Partial<EntityMention>): EntityMention {
  return {
    source: 'github',
    identifier: 'johndoe',
    timestamp: new Date(),
    ...overrides,
  };
}

// =============================================================================
// InMemoryEntityResolverStore Tests
// =============================================================================

describe('InMemoryEntityResolverStore', () => {
  let store: InMemoryEntityResolverStore;

  beforeEach(() => {
    store = new InMemoryEntityResolverStore();
  });

  describe('saveEntity and getEntity', () => {
    it('should save and retrieve an entity', async () => {
      const entity = createTestEntity();
      await store.saveEntity(entity);

      const retrieved = await store.getEntity(entity.canonicalId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.canonicalId).toBe(entity.canonicalId);
      expect(retrieved?.displayName).toBe('John Doe');
    });

    it('should return null for non-existent entity', async () => {
      const result = await store.getEntity('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('listEntities', () => {
    beforeEach(async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e1',
        type: 'person',
        displayName: 'Alice',
        tenantId: 'tenant-a',
        mentions: [{ source: 'github', identifier: 'alice', timestamp: new Date() }],
      }));
      await store.saveEntity(createTestEntity({
        canonicalId: 'e2',
        type: 'team',
        displayName: 'Backend Team',
        tenantId: 'tenant-a',
        mentions: [{ source: 'slack', identifier: 'backend', timestamp: new Date() }],
      }));
      await store.saveEntity(createTestEntity({
        canonicalId: 'e3',
        type: 'person',
        displayName: 'Bob',
        tenantId: 'tenant-b',
        mentions: [{ source: 'github', identifier: 'bob', timestamp: new Date() }],
      }));
    });

    it('should list all entities', async () => {
      const entities = await store.listEntities({});
      expect(entities.length).toBe(3);
    });

    it('should filter by type', async () => {
      const entities = await store.listEntities({ type: 'person' });
      expect(entities.length).toBe(2);
    });

    it('should filter by tenantId', async () => {
      const entities = await store.listEntities({ tenantId: 'tenant-a' });
      expect(entities.length).toBe(2);
    });

    it('should filter by source', async () => {
      const entities = await store.listEntities({ source: 'slack' });
      expect(entities.length).toBe(1);
      expect(entities[0].displayName).toBe('Backend Team');
    });

    it('should filter by displayName partial match', async () => {
      const entities = await store.listEntities({ displayNameContains: 'Ali' });
      expect(entities.length).toBe(1);
      expect(entities[0].displayName).toBe('Alice');
    });

    it('should filter by minConfidence', async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e4',
        displayName: 'LowConf',
        confidence: 0.3,
      }));

      const entities = await store.listEntities({ minConfidence: 0.5 });
      expect(entities.every(e => e.confidence >= 0.5)).toBe(true);
    });

    it('should respect limit and offset', async () => {
      const entities = await store.listEntities({ limit: 2, offset: 1 });
      expect(entities.length).toBe(2);
    });
  });

  describe('findByMention', () => {
    beforeEach(async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e1',
        displayName: 'Alice',
        mentions: [
          { source: 'github', identifier: 'alice', timestamp: new Date() },
          { source: 'slack', identifier: '@AliceSmith', timestamp: new Date() },
        ],
      }));
    });

    it('should find entity by exact mention', async () => {
      const result = await store.findByMention('github', 'alice');
      expect(result).toBeDefined();
      expect(result?.displayName).toBe('Alice');
    });

    it('should find entity case-insensitively', async () => {
      const result = await store.findByMention('github', 'ALICE');
      expect(result).toBeDefined();
    });

    it('should return null for non-existent mention', async () => {
      const result = await store.findByMention('github', 'unknown');
      expect(result).toBeNull();
    });
  });

  describe('findSimilar', () => {
    beforeEach(async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e1',
        embedding: [1, 0, 0],
      }));
      await store.saveEntity(createTestEntity({
        canonicalId: 'e2',
        embedding: [0.9, 0.1, 0],
      }));
      await store.saveEntity(createTestEntity({
        canonicalId: 'e3',
        embedding: [0, 1, 0],
      }));
    });

    it('should find similar entities by embedding', async () => {
      const results = await store.findSimilar([1, 0, 0], 2);

      expect(results.length).toBe(2);
      expect(results[0].entity.canonicalId).toBe('e1');
      expect(results[0].similarity).toBeCloseTo(1.0, 2);
    });

    it('should respect limit', async () => {
      const results = await store.findSimilar([1, 0, 0], 1);
      expect(results.length).toBe(1);
    });
  });

  describe('updateEntity', () => {
    it('should update entity properties', async () => {
      const entity = createTestEntity({ canonicalId: 'e1' });
      await store.saveEntity(entity);

      await store.updateEntity('e1', { displayName: 'Updated Name' });

      const updated = await store.getEntity('e1');
      expect(updated?.displayName).toBe('Updated Name');
    });
  });

  describe('deleteEntity', () => {
    it('should delete an entity', async () => {
      const entity = createTestEntity({ canonicalId: 'e1' });
      await store.saveEntity(entity);

      await store.deleteEntity('e1');

      const result = await store.getEntity('e1');
      expect(result).toBeNull();
    });

    it('should remove mention from index', async () => {
      const entity = createTestEntity({
        canonicalId: 'e1',
        mentions: [{ source: 'github', identifier: 'test', timestamp: new Date() }],
      });
      await store.saveEntity(entity);

      await store.deleteEntity('e1');

      const byMention = await store.findByMention('github', 'test');
      expect(byMention).toBeNull();
    });
  });

  describe('addMention', () => {
    it('should add a mention to existing entity', async () => {
      const entity = createTestEntity({ canonicalId: 'e1' });
      await store.saveEntity(entity);

      await store.addMention('e1', {
        source: 'slack',
        identifier: '@newhandle',
        timestamp: new Date(),
      });

      const updated = await store.getEntity('e1');
      expect(updated?.mentions.length).toBe(2);

      const byMention = await store.findByMention('slack', '@newhandle');
      expect(byMention?.canonicalId).toBe('e1');
    });
  });
});

// =============================================================================
// EntityResolver Tests
// =============================================================================

describe('EntityResolver', () => {
  let store: InMemoryEntityResolverStore;
  let resolver: EntityResolver;

  beforeEach(() => {
    store = new InMemoryEntityResolverStore();
    resolver = new EntityResolver({ store, tenantId: 'tenant-1' });
  });

  describe('resolve', () => {
    it('should resolve exact match', async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e1',
        tenantId: 'tenant-1',
        mentions: [{ source: 'github', identifier: 'alice', timestamp: new Date() }],
      }));

      const result = await resolver.resolve({
        source: 'github',
        identifier: 'alice',
        timestamp: new Date(),
      });

      expect(result.found).toBe(true);
      expect(result.confidence).toBe(1.0);
      expect(result.method).toBe('exact-match');
    });

    it('should resolve by email', async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e1',
        tenantId: 'tenant-1',
        mentions: [{ source: 'email', identifier: 'alice@example.com', timestamp: new Date() }],
      }));

      const result = await resolver.resolve({
        source: 'github',
        identifier: 'alice@example.com',
        timestamp: new Date(),
      });

      expect(result.found).toBe(true);
      expect(result.method).toBe('email-match');
    });

    it('should resolve by username similarity', async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e1',
        tenantId: 'tenant-1',
        displayName: 'Alice Smith',
        mentions: [{ source: 'github', identifier: 'alicesmith', timestamp: new Date() }],
      }));

      const result = await resolver.resolve({
        source: 'slack',
        identifier: 'alice_smith',
        timestamp: new Date(),
      });

      expect(result.found).toBe(true);
      expect(result.method).toBe('username-match');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return not found for unknown mention', async () => {
      const result = await resolver.resolve({
        source: 'github',
        identifier: 'unknown_user',
        timestamp: new Date(),
      });

      expect(result.found).toBe(false);
    });
  });

  describe('resolveMany', () => {
    it('should resolve multiple mentions', async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e1',
        tenantId: 'tenant-1',
        mentions: [{ source: 'github', identifier: 'alice', timestamp: new Date() }],
      }));

      const mentions: EntityMention[] = [
        { source: 'github', identifier: 'alice', timestamp: new Date() },
        { source: 'slack', identifier: 'bob', timestamp: new Date() },
      ];

      const entities = await resolver.resolveMany(mentions);

      expect(entities.length).toBe(2);
      // First should match existing entity
      expect(entities[0].canonicalId).toBe('e1');
      // Second should create new entity
      expect(entities[1].canonicalId).toMatch(/^entity_/);
    });

    it('should add new mention to existing entity', async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e1',
        tenantId: 'tenant-1',
        mentions: [{ source: 'github', identifier: 'alice', timestamp: new Date() }],
      }));

      // Resolve with a different source but same exact match
      await resolver.resolveMany([
        { source: 'github', identifier: 'alice', timestamp: new Date() },
      ]);

      const entity = await store.getEntity('e1');
      // Should not duplicate the mention
      expect(entity?.mentions.length).toBe(1);
    });
  });

  describe('merge', () => {
    it('should merge multiple entities', async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e1',
        tenantId: 'tenant-1',
        displayName: 'Alice (GitHub)',
        mentions: [{ source: 'github', identifier: 'alice', timestamp: new Date() }],
        confidence: 0.8,
      }));
      await store.saveEntity(createTestEntity({
        canonicalId: 'e2',
        tenantId: 'tenant-1',
        displayName: 'Alice (Slack)',
        mentions: [{ source: 'slack', identifier: '@alice', timestamp: new Date() }],
        confidence: 0.9,
      }));

      const result = await resolver.merge(['e1', 'e2']);

      expect(result.mergedIds).toEqual(['e1', 'e2']);
      expect(result.mentionCount).toBe(2);
      expect(result.entity.mentions.length).toBe(2);
      expect(result.entity.confidence).toBe(0.9); // Max confidence

      // Second entity should be deleted
      const deleted = await store.getEntity('e2');
      expect(deleted).toBeNull();
    });

    it('should throw if not enough entities to merge', async () => {
      await expect(resolver.merge(['e1'])).rejects.toThrow('at least 2');
    });
  });

  describe('findMergeCandidates', () => {
    it('should find candidates with similar usernames', async () => {
      await store.saveEntity(createTestEntity({
        canonicalId: 'e1',
        tenantId: 'tenant-1',
        displayName: 'Alice Smith',
        mentions: [{ source: 'github', identifier: 'alicesmith', timestamp: new Date() }],
      }));
      await store.saveEntity(createTestEntity({
        canonicalId: 'e2',
        tenantId: 'tenant-1',
        displayName: 'Alice S',
        mentions: [{ source: 'slack', identifier: 'alice_s', timestamp: new Date() }],
      }));

      const candidates = await resolver.findMergeCandidates('e1', 5);

      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates[0].entity.canonicalId).toBe('e2');
    });
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('Factory Functions', () => {
  afterEach(() => {
    resetEntityResolverStore();
  });

  describe('generateEntityId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateEntityId();
      const id2 = generateEntityId();

      expect(id1).toMatch(/^entity_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createEntityResolver', () => {
    it('should create a resolver with default store', () => {
      const resolver = createEntityResolver('tenant-1');
      expect(resolver).toBeInstanceOf(EntityResolver);
    });

    it('should create a resolver with custom store', () => {
      const customStore = new InMemoryEntityResolverStore();
      const resolver = createEntityResolver('tenant-1', customStore);
      expect(resolver).toBeInstanceOf(EntityResolver);
    });
  });

  describe('Singleton Store', () => {
    it('should return same instance', () => {
      const store1 = getEntityResolverStore();
      const store2 = getEntityResolverStore();

      expect(store1).toBe(store2);
    });

    it('should allow setting custom store', () => {
      const customStore = new InMemoryEntityResolverStore();
      setEntityResolverStore(customStore);

      expect(getEntityResolverStore()).toBe(customStore);
    });
  });
});
