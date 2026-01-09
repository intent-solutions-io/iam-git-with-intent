/**
 * Entity Resolver
 *
 * Phase 35: Part B - Context Graph / Decision Ledger
 *
 * Cross-system identity resolution using embeddings.
 * Enables "probabilistic joins" where foreign keys don't exist.
 *
 * The Five Coordinate Systems Problem:
 * - Events: Raw actions
 * - Timeline: Temporal ordering
 * - Semantics: Meaning/intent
 * - Attribution: Who did what
 * - Outcomes: Results
 *
 * Traditional joins fail across these systems. LLM embeddings enable
 * probabilistic joins for cross-system identity matching.
 *
 * @module @gwi/core/context-graph/entity-resolver
 */

// =============================================================================
// Source Types
// =============================================================================

/**
 * Known entity sources in the system
 */
export type EntitySource =
  | 'github'
  | 'slack'
  | 'jira'
  | 'linear'
  | 'email'
  | 'internal'
  | 'unknown';

/**
 * Types of entities we can resolve
 */
export type EntityType =
  | 'person'
  | 'team'
  | 'project'
  | 'component'
  | 'repository';

// =============================================================================
// Entity Mention
// =============================================================================

/**
 * A reference to an entity in a specific system
 *
 * Example: "@JayaGup10" in Slack, "jgupta@company.com" in email
 */
export interface EntityMention {
  /** Source system */
  source: EntitySource;
  /** Identifier in that system (username, email, etc.) */
  identifier: string;
  /** Surrounding context for disambiguation */
  context?: string;
  /** When this mention was observed */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Resolved Entity
// =============================================================================

/**
 * How the entity was resolved
 */
export type ResolutionMethod =
  | 'exact-match'     // Identifiers matched exactly
  | 'email-match'     // Email addresses matched
  | 'username-match'  // Similar usernames
  | 'embedding'       // Vector similarity
  | 'llm-confirmed'   // LLM confirmed the match
  | 'manual';         // Manually linked by user

/**
 * A resolved entity that may have multiple mentions across systems
 */
export interface ResolvedEntity {
  /** Canonical ID for this entity */
  canonicalId: string;
  /** Type of entity */
  type: EntityType;
  /** Human-readable display name */
  displayName: string;
  /** All known mentions/representations */
  mentions: EntityMention[];
  /** Confidence in the resolution (0.0-1.0) */
  confidence: number;
  /** How this entity was resolved */
  resolvedBy: ResolutionMethod;
  /** Vector embedding for similarity search */
  embedding?: number[];
  /** Tenant context */
  tenantId: string;
  /** When the entity was first created */
  createdAt: Date;
  /** When the entity was last updated */
  updatedAt: Date;
  /** Merged from these entity IDs */
  mergedFrom?: string[];
}

// =============================================================================
// Resolution Result
// =============================================================================

/**
 * Result of resolving an entity mention
 */
export interface ResolutionResult {
  /** Whether a match was found */
  found: boolean;
  /** The resolved entity (if found) */
  entity?: ResolvedEntity;
  /** Confidence in the match */
  confidence: number;
  /** How the match was made */
  method: ResolutionMethod;
  /** Alternative candidates considered */
  alternatives?: Array<{
    entity: ResolvedEntity;
    confidence: number;
  }>;
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  /** The merged entity */
  entity: ResolvedEntity;
  /** Entities that were merged */
  mergedIds: string[];
  /** Number of mentions combined */
  mentionCount: number;
}

// =============================================================================
// Entity Resolver Store Interface
// =============================================================================

/**
 * Filter for querying entities
 */
export interface EntityFilter {
  /** Filter by type */
  type?: EntityType;
  /** Filter by tenant */
  tenantId?: string;
  /** Filter by source (any mention from this source) */
  source?: EntitySource;
  /** Minimum confidence */
  minConfidence?: number;
  /** Search by display name (partial match) */
  displayNameContains?: string;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Store interface for resolved entities
 */
export interface EntityResolverStore {
  /**
   * Save a resolved entity
   */
  saveEntity(entity: ResolvedEntity): Promise<void>;

  /**
   * Get an entity by canonical ID
   */
  getEntity(canonicalId: string): Promise<ResolvedEntity | null>;

  /**
   * List entities with filtering
   */
  listEntities(filter: EntityFilter): Promise<ResolvedEntity[]>;

  /**
   * Find entity by mention (exact match)
   */
  findByMention(
    source: EntitySource,
    identifier: string
  ): Promise<ResolvedEntity | null>;

  /**
   * Find similar entities by embedding
   */
  findSimilar(
    embedding: number[],
    limit: number,
    filter?: EntityFilter
  ): Promise<Array<{ entity: ResolvedEntity; similarity: number }>>;

  /**
   * Update an entity
   */
  updateEntity(
    canonicalId: string,
    update: Partial<ResolvedEntity>
  ): Promise<void>;

  /**
   * Delete an entity
   */
  deleteEntity(canonicalId: string): Promise<void>;

  /**
   * Add a mention to an existing entity
   */
  addMention(canonicalId: string, mention: EntityMention): Promise<void>;
}

// =============================================================================
// In-Memory Store Implementation
// =============================================================================

/**
 * In-memory entity resolver store for development and testing
 */
export class InMemoryEntityResolverStore implements EntityResolverStore {
  private entities = new Map<string, ResolvedEntity>();
  // Index: source:identifier -> canonicalId
  private mentionIndex = new Map<string, string>();

  async saveEntity(entity: ResolvedEntity): Promise<void> {
    this.entities.set(entity.canonicalId, { ...entity });

    // Index all mentions
    for (const mention of entity.mentions) {
      const key = `${mention.source}:${mention.identifier.toLowerCase()}`;
      this.mentionIndex.set(key, entity.canonicalId);
    }
  }

  async getEntity(canonicalId: string): Promise<ResolvedEntity | null> {
    return this.entities.get(canonicalId) ?? null;
  }

  async listEntities(filter: EntityFilter): Promise<ResolvedEntity[]> {
    let results = Array.from(this.entities.values());

    if (filter.type) {
      results = results.filter(e => e.type === filter.type);
    }
    if (filter.tenantId) {
      results = results.filter(e => e.tenantId === filter.tenantId);
    }
    if (filter.source) {
      results = results.filter(e =>
        e.mentions.some(m => m.source === filter.source)
      );
    }
    if (filter.minConfidence !== undefined) {
      results = results.filter(e => e.confidence >= filter.minConfidence!);
    }
    if (filter.displayNameContains) {
      const search = filter.displayNameContains.toLowerCase();
      results = results.filter(e =>
        e.displayName.toLowerCase().includes(search)
      );
    }

    // Sort by display name
    results.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // Apply pagination
    if (filter.offset) {
      results = results.slice(filter.offset);
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async findByMention(
    source: EntitySource,
    identifier: string
  ): Promise<ResolvedEntity | null> {
    const key = `${source}:${identifier.toLowerCase()}`;
    const canonicalId = this.mentionIndex.get(key);

    if (!canonicalId) return null;

    return this.getEntity(canonicalId);
  }

  async findSimilar(
    embedding: number[],
    limit: number,
    filter?: EntityFilter
  ): Promise<Array<{ entity: ResolvedEntity; similarity: number }>> {
    let candidates = await this.listEntities(filter ?? {});

    // Filter to entities with embeddings
    candidates = candidates.filter(e => e.embedding?.length);

    // Calculate similarity and sort
    const results = candidates
      .map(entity => ({
        entity,
        similarity: this.cosineSimilarity(embedding, entity.embedding!),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }

  async updateEntity(
    canonicalId: string,
    update: Partial<ResolvedEntity>
  ): Promise<void> {
    const entity = this.entities.get(canonicalId);
    if (entity) {
      const updated = { ...entity, ...update, updatedAt: new Date() };
      this.entities.set(canonicalId, updated);

      // Re-index mentions if they changed
      if (update.mentions) {
        // Remove old mentions from index
        for (const mention of entity.mentions) {
          const key = `${mention.source}:${mention.identifier.toLowerCase()}`;
          this.mentionIndex.delete(key);
        }
        // Add new mentions to index
        for (const mention of update.mentions) {
          const key = `${mention.source}:${mention.identifier.toLowerCase()}`;
          this.mentionIndex.set(key, canonicalId);
        }
      }
    }
  }

  async deleteEntity(canonicalId: string): Promise<void> {
    const entity = this.entities.get(canonicalId);
    if (entity) {
      // Remove from mention index
      for (const mention of entity.mentions) {
        const key = `${mention.source}:${mention.identifier.toLowerCase()}`;
        this.mentionIndex.delete(key);
      }
      this.entities.delete(canonicalId);
    }
  }

  async addMention(canonicalId: string, mention: EntityMention): Promise<void> {
    const entity = this.entities.get(canonicalId);
    if (entity) {
      entity.mentions.push(mention);
      entity.updatedAt = new Date();

      // Index the new mention
      const key = `${mention.source}:${mention.identifier.toLowerCase()}`;
      this.mentionIndex.set(key, canonicalId);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.entities.clear();
    this.mentionIndex.clear();
  }

  /**
   * Get count (for testing)
   */
  count(): number {
    return this.entities.size;
  }
}

// =============================================================================
// Entity Resolver Service
// =============================================================================

/**
 * Entity Resolver Service
 *
 * Resolves entity mentions across different systems into canonical identities.
 *
 * Resolution pipeline:
 * 1. Exact match (source + identifier)
 * 2. Email match (if email present)
 * 3. Username similarity
 * 4. Embedding similarity (if embeddings available)
 * 5. Optional LLM confirmation for edge cases
 */
export class EntityResolver {
  private store: EntityResolverStore;
  private tenantId: string;

  constructor(options: {
    store?: EntityResolverStore;
    tenantId: string;
  }) {
    this.store = options.store ?? new InMemoryEntityResolverStore();
    this.tenantId = options.tenantId;
  }

  /**
   * Resolve a single mention
   */
  async resolve(mention: EntityMention): Promise<ResolutionResult> {
    // Step 1: Exact match by source + identifier
    const exactMatch = await this.store.findByMention(
      mention.source,
      mention.identifier
    );

    if (exactMatch) {
      return {
        found: true,
        entity: exactMatch,
        confidence: 1.0,
        method: 'exact-match',
      };
    }

    // Step 2: Check if identifier looks like an email
    if (this.looksLikeEmail(mention.identifier)) {
      const emailMatch = await this.findByEmail(mention.identifier);
      if (emailMatch) {
        return {
          found: true,
          entity: emailMatch,
          confidence: 0.95,
          method: 'email-match',
        };
      }
    }

    // Step 3: Username similarity search
    const usernameMatches = await this.findByUsernameSimilarity(
      mention.identifier
    );
    if (usernameMatches.length > 0 && usernameMatches[0].similarity > 0.8) {
      return {
        found: true,
        entity: usernameMatches[0].entity,
        confidence: usernameMatches[0].similarity,
        method: 'username-match',
        alternatives: usernameMatches.slice(1).map(m => ({
          entity: m.entity,
          confidence: m.similarity,
        })),
      };
    }

    // Not found
    return {
      found: false,
      confidence: 0,
      method: 'exact-match',
      alternatives: usernameMatches.slice(0, 3).map(m => ({
        entity: m.entity,
        confidence: m.similarity,
      })),
    };
  }

  /**
   * Resolve multiple mentions and find/create entities
   */
  async resolveMany(mentions: EntityMention[]): Promise<ResolvedEntity[]> {
    const resolved: ResolvedEntity[] = [];

    for (const mention of mentions) {
      const result = await this.resolve(mention);

      if (result.found && result.entity) {
        // Add this mention to the existing entity if not already present
        const hasMention = result.entity.mentions.some(
          m => m.source === mention.source &&
               m.identifier.toLowerCase() === mention.identifier.toLowerCase()
        );

        if (!hasMention) {
          await this.store.addMention(result.entity.canonicalId, mention);
          result.entity.mentions.push(mention);
        }

        resolved.push(result.entity);
      } else {
        // Create new entity for unresolved mention
        const newEntity = this.createEntityFromMention(mention);
        await this.store.saveEntity(newEntity);
        resolved.push(newEntity);
      }
    }

    return resolved;
  }

  /**
   * Merge multiple entities into one
   */
  async merge(entityIds: string[]): Promise<MergeResult> {
    if (entityIds.length < 2) {
      throw new Error('Need at least 2 entities to merge');
    }

    // Load all entities
    const entities: ResolvedEntity[] = [];
    for (const id of entityIds) {
      const entity = await this.store.getEntity(id);
      if (entity) {
        entities.push(entity);
      }
    }

    if (entities.length < 2) {
      throw new Error('Could not find enough entities to merge');
    }

    // Use first entity as base
    const [primary, ...others] = entities;

    // Combine all mentions
    const allMentions = [...primary.mentions];
    for (const entity of others) {
      for (const mention of entity.mentions) {
        // Avoid duplicates
        const exists = allMentions.some(
          m => m.source === mention.source &&
               m.identifier.toLowerCase() === mention.identifier.toLowerCase()
        );
        if (!exists) {
          allMentions.push(mention);
        }
      }
    }

    // Update primary entity
    const mergedEntity: ResolvedEntity = {
      ...primary,
      mentions: allMentions,
      confidence: Math.max(...entities.map(e => e.confidence)),
      resolvedBy: 'manual',
      updatedAt: new Date(),
      mergedFrom: entityIds,
    };

    // Save updated entity
    await this.store.saveEntity(mergedEntity);

    // Delete other entities
    for (const entity of others) {
      await this.store.deleteEntity(entity.canonicalId);
    }

    return {
      entity: mergedEntity,
      mergedIds: entityIds,
      mentionCount: allMentions.length,
    };
  }

  /**
   * Find entities that might be the same person (candidates for merge)
   */
  async findMergeCandidates(
    canonicalId: string,
    limit = 5
  ): Promise<Array<{ entity: ResolvedEntity; similarity: number }>> {
    const entity = await this.store.getEntity(canonicalId);
    if (!entity) return [];

    // If we have an embedding, use it
    if (entity.embedding) {
      return this.store.findSimilar(entity.embedding, limit, {
        tenantId: this.tenantId,
        type: entity.type,
      });
    }

    // Otherwise, use username similarity
    const results: Array<{ entity: ResolvedEntity; similarity: number }> = [];

    for (const mention of entity.mentions) {
      const similar = await this.findByUsernameSimilarity(mention.identifier);
      for (const match of similar) {
        if (match.entity.canonicalId !== canonicalId) {
          results.push(match);
        }
      }
    }

    // Dedupe and sort
    const seen = new Set<string>();
    return results
      .filter(r => {
        if (seen.has(r.entity.canonicalId)) return false;
        seen.add(r.entity.canonicalId);
        return true;
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  /**
   * Check if a string looks like an email
   */
  private looksLikeEmail(str: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  }

  /**
   * Find entity by email address
   */
  private async findByEmail(email: string): Promise<ResolvedEntity | null> {
    const normalized = email.toLowerCase();

    // Search through all entities for matching email
    const entities = await this.store.listEntities({
      tenantId: this.tenantId,
    });

    for (const entity of entities) {
      for (const mention of entity.mentions) {
        if (
          mention.source === 'email' &&
          mention.identifier.toLowerCase() === normalized
        ) {
          return entity;
        }
        // Also check if any identifier is an email that matches
        if (
          this.looksLikeEmail(mention.identifier) &&
          mention.identifier.toLowerCase() === normalized
        ) {
          return entity;
        }
      }
    }

    return null;
  }

  /**
   * Find entities with similar usernames
   */
  private async findByUsernameSimilarity(
    username: string
  ): Promise<Array<{ entity: ResolvedEntity; similarity: number }>> {
    const normalized = this.normalizeUsername(username);

    const entities = await this.store.listEntities({
      tenantId: this.tenantId,
    });

    const results: Array<{ entity: ResolvedEntity; similarity: number }> = [];

    for (const entity of entities) {
      let bestSimilarity = 0;

      for (const mention of entity.mentions) {
        const mentionNorm = this.normalizeUsername(mention.identifier);
        const similarity = this.stringSimilarity(normalized, mentionNorm);
        bestSimilarity = Math.max(bestSimilarity, similarity);
      }

      // Also check display name
      const displayNameNorm = this.normalizeUsername(entity.displayName);
      const displaySim = this.stringSimilarity(normalized, displayNameNorm);
      bestSimilarity = Math.max(bestSimilarity, displaySim);

      if (bestSimilarity > 0.5) {
        results.push({ entity, similarity: bestSimilarity });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Normalize a username for comparison
   */
  private normalizeUsername(username: string): string {
    return username
      .toLowerCase()
      .replace(/[@#]/g, '')  // Remove @ and #
      .replace(/[-_.]/g, '') // Remove separators
      .replace(/\d+$/g, '');  // Remove trailing numbers
  }

  /**
   * Calculate string similarity (Jaro-Winkler-like)
   */
  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Check if one contains the other
    if (a.includes(b) || b.includes(a)) {
      return Math.min(a.length, b.length) / Math.max(a.length, b.length);
    }

    // Levenshtein-based similarity
    const distance = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);

    return 1 - distance / maxLen;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Create a new entity from a mention
   */
  private createEntityFromMention(mention: EntityMention): ResolvedEntity {
    return {
      canonicalId: `entity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'person', // Default to person
      displayName: this.inferDisplayName(mention),
      mentions: [mention],
      confidence: 0.5, // Lower confidence for auto-created entities
      resolvedBy: 'exact-match',
      tenantId: this.tenantId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Infer a display name from a mention
   */
  private inferDisplayName(mention: EntityMention): string {
    const id = mention.identifier;

    // If email, use the part before @
    if (this.looksLikeEmail(id)) {
      const name = id.split('@')[0];
      // Convert jsmith or j.smith to J Smith
      return name
        .replace(/[._-]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }

    // Remove @ prefix
    const cleaned = id.replace(/^@/, '');

    // Convert camelCase or snake_case to Title Case
    return cleaned
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique entity ID
 */
export function generateEntityId(): string {
  return `entity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create an entity resolver for a tenant
 */
export function createEntityResolver(
  tenantId: string,
  store?: EntityResolverStore
): EntityResolver {
  return new EntityResolver({ tenantId, store });
}

// =============================================================================
// Singleton Store Instance
// =============================================================================

let entityStoreInstance: EntityResolverStore | null = null;

/**
 * Get or create the global entity resolver store
 */
export function getEntityResolverStore(): EntityResolverStore {
  if (!entityStoreInstance) {
    entityStoreInstance = new InMemoryEntityResolverStore();
  }
  return entityStoreInstance;
}

/**
 * Set the entity resolver store (for dependency injection)
 */
export function setEntityResolverStore(store: EntityResolverStore): void {
  entityStoreInstance = store;
}

/**
 * Reset the entity resolver store (for testing)
 */
export function resetEntityResolverStore(): void {
  entityStoreInstance = null;
}
