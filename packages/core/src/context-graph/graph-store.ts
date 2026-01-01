/**
 * Context Graph Store
 *
 * Phase 35: Part B - Context Graph / Decision Ledger
 *
 * Event-sourced, graph-structured decision storage that enables:
 * - "Why did this happen?" queries via trajectory traversal
 * - Similar decision lookup for precedent-based reasoning
 * - Cross-system joins via embeddings where foreign keys don't exist
 *
 * Key concepts:
 * - Nodes: Decisions, events, entities, artifacts, policies
 * - Edges: Causal, approval, reference, supersession, blocking relationships
 * - Probabilistic joins: Confidence scores on inferred edges
 *
 * @module @gwi/core/context-graph/graph-store
 */

// =============================================================================
// Node Types
// =============================================================================

/**
 * Types of nodes in the context graph
 */
export type ContextNodeType =
  | 'decision'    // AI or human decision
  | 'event'       // System event (PR created, merged, etc.)
  | 'entity'      // Person, team, project, component
  | 'artifact'    // Code, PR, issue, document
  | 'policy';     // Rule or constraint that was evaluated

/**
 * A node in the context graph
 */
export interface ContextNode {
  /** Unique node ID */
  id: string;
  /** Type of node */
  type: ContextNodeType;
  /** When this node was created */
  timestamp: Date;
  /** Tenant context */
  tenantId: string;
  /** Node-specific data */
  data: Record<string, unknown>;
  /** Vector embedding for semantic search */
  embedding?: number[];
  /** Human-readable label */
  label?: string;
  /** Tags for filtering */
  tags?: string[];
}

// =============================================================================
// Edge Types
// =============================================================================

/**
 * Types of edges in the context graph
 */
export type ContextEdgeType =
  | 'caused'       // A caused B
  | 'approved'     // A approved B
  | 'referenced'   // A referenced B
  | 'superseded'   // A superseded B (newer replaces older)
  | 'blocked'      // A blocked B
  | 'created'      // A created B
  | 'modified'     // A modified B
  | 'triggered'    // A triggered B
  | 'contributed'  // A contributed to B
  | 'inferred';    // Relationship inferred by LLM/embedding

/**
 * An edge in the context graph
 */
export interface ContextEdge {
  /** Unique edge ID */
  id: string;
  /** Source node ID */
  sourceId: string;
  /** Target node ID */
  targetId: string;
  /** Type of relationship */
  type: ContextEdgeType;
  /** Confidence score (0.0-1.0), lower for inferred edges */
  confidence: number;
  /** When this edge was created */
  timestamp: Date;
  /** Edge-specific metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Query Types
// =============================================================================

/**
 * Filter for querying nodes
 */
export interface NodeFilter {
  /** Filter by node type */
  type?: ContextNodeType;
  /** Filter by tenant */
  tenantId?: string;
  /** Filter by time range */
  fromTimestamp?: Date;
  toTimestamp?: Date;
  /** Filter by tags */
  tags?: string[];
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Filter for querying edges
 */
export interface EdgeFilter {
  /** Filter by source node */
  sourceId?: string;
  /** Filter by target node */
  targetId?: string;
  /** Filter by edge type */
  type?: ContextEdgeType;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Limit results */
  limit?: number;
}

/**
 * Result of a trajectory query
 */
export interface TrajectoryResult {
  /** The path of nodes from root to target */
  path: ContextNode[];
  /** The edges connecting the nodes */
  edges: ContextEdge[];
  /** Total confidence (product of edge confidences) */
  confidence: number;
}

/**
 * Result of a precedent search
 */
export interface PrecedentResult {
  /** Similar past decision */
  node: ContextNode;
  /** Similarity score (0.0-1.0) */
  similarity: number;
  /** Outcome of this precedent */
  outcome?: string;
  /** How long ago this occurred */
  age: number; // milliseconds
}

// =============================================================================
// Graph Store Interface
// =============================================================================

/**
 * Interface for the context graph store
 */
export interface ContextGraphStore {
  // ==========================================================================
  // Core Operations
  // ==========================================================================

  /**
   * Add a node to the graph
   */
  addNode(node: ContextNode): Promise<void>;

  /**
   * Add an edge between nodes
   */
  addEdge(edge: ContextEdge): Promise<void>;

  /**
   * Get a node by ID
   */
  getNode(id: string): Promise<ContextNode | null>;

  /**
   * Get an edge by ID
   */
  getEdge(id: string): Promise<ContextEdge | null>;

  /**
   * Update a node
   */
  updateNode(id: string, update: Partial<ContextNode>): Promise<void>;

  /**
   * Delete a node and its edges (soft delete preferred)
   */
  deleteNode(id: string): Promise<void>;

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * List nodes with filtering
   */
  listNodes(filter: NodeFilter): Promise<ContextNode[]>;

  /**
   * Get all edges connected to a node
   */
  getEdgesForNode(
    nodeId: string,
    direction?: 'incoming' | 'outgoing' | 'both'
  ): Promise<ContextEdge[]>;

  /**
   * List edges with filtering
   */
  listEdges(filter: EdgeFilter): Promise<ContextEdge[]>;

  /**
   * Get successor nodes (nodes this node points to)
   */
  getSuccessors(nodeId: string): Promise<ContextNode[]>;

  /**
   * Get predecessor nodes (nodes that point to this node)
   */
  getPredecessors(nodeId: string): Promise<ContextNode[]>;

  // ==========================================================================
  // Trajectory Queries ("Why did this happen?")
  // ==========================================================================

  /**
   * Get the full trajectory (causal chain) leading to a node
   *
   * Traverses backwards through causal edges to find root causes.
   */
  getTrajectory(
    nodeId: string,
    maxDepth?: number
  ): Promise<TrajectoryResult>;

  /**
   * Get forward trajectory (what did this cause?)
   */
  getConsequences(
    nodeId: string,
    maxDepth?: number
  ): Promise<TrajectoryResult>;

  // ==========================================================================
  // Precedent Queries ("What happened before in similar situations?")
  // ==========================================================================

  /**
   * Find similar past decisions using embedding similarity
   */
  findPrecedents(
    embedding: number[],
    limit: number,
    filter?: NodeFilter
  ): Promise<PrecedentResult[]>;

  /**
   * Find nodes with similar data patterns
   */
  findSimilarNodes(
    node: ContextNode,
    limit: number
  ): Promise<PrecedentResult[]>;

  // ==========================================================================
  // Cross-System Joins
  // ==========================================================================

  /**
   * Infer edges between nodes using embedding similarity
   *
   * This enables "probabilistic joins" where foreign keys don't exist.
   */
  inferEdges(
    sourceNodes: ContextNode[],
    targetNodes: ContextNode[],
    threshold: number,
    edgeType: ContextEdgeType
  ): Promise<ContextEdge[]>;

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get graph statistics
   */
  getStats(tenantId?: string): Promise<{
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<ContextNodeType, number>;
    edgesByType: Record<ContextEdgeType, number>;
  }>;
}

// =============================================================================
// In-Memory Implementation
// =============================================================================

/**
 * In-memory context graph store for development and testing
 */
export class InMemoryContextGraphStore implements ContextGraphStore {
  private nodes = new Map<string, ContextNode>();
  private edges = new Map<string, ContextEdge>();

  // Indexes for efficient lookups
  private edgesBySource = new Map<string, Set<string>>();
  private edgesByTarget = new Map<string, Set<string>>();

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  async addNode(node: ContextNode): Promise<void> {
    this.nodes.set(node.id, { ...node });
  }

  async addEdge(edge: ContextEdge): Promise<void> {
    this.edges.set(edge.id, { ...edge });

    // Update indexes
    if (!this.edgesBySource.has(edge.sourceId)) {
      this.edgesBySource.set(edge.sourceId, new Set());
    }
    this.edgesBySource.get(edge.sourceId)!.add(edge.id);

    if (!this.edgesByTarget.has(edge.targetId)) {
      this.edgesByTarget.set(edge.targetId, new Set());
    }
    this.edgesByTarget.get(edge.targetId)!.add(edge.id);
  }

  async getNode(id: string): Promise<ContextNode | null> {
    return this.nodes.get(id) ?? null;
  }

  async getEdge(id: string): Promise<ContextEdge | null> {
    return this.edges.get(id) ?? null;
  }

  async updateNode(id: string, update: Partial<ContextNode>): Promise<void> {
    const node = this.nodes.get(id);
    if (node) {
      this.nodes.set(id, { ...node, ...update });
    }
  }

  async deleteNode(id: string): Promise<void> {
    // Delete edges connected to this node
    const incomingEdges = this.edgesByTarget.get(id) ?? new Set();
    const outgoingEdges = this.edgesBySource.get(id) ?? new Set();

    for (const edgeId of [...incomingEdges, ...outgoingEdges]) {
      this.edges.delete(edgeId);
    }

    // Clean up indexes
    this.edgesBySource.delete(id);
    this.edgesByTarget.delete(id);

    // Delete node
    this.nodes.delete(id);
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  async listNodes(filter: NodeFilter): Promise<ContextNode[]> {
    let results = Array.from(this.nodes.values());

    if (filter.type) {
      results = results.filter(n => n.type === filter.type);
    }
    if (filter.tenantId) {
      results = results.filter(n => n.tenantId === filter.tenantId);
    }
    if (filter.fromTimestamp) {
      results = results.filter(n => n.timestamp >= filter.fromTimestamp!);
    }
    if (filter.toTimestamp) {
      results = results.filter(n => n.timestamp <= filter.toTimestamp!);
    }
    if (filter.tags?.length) {
      results = results.filter(n =>
        filter.tags!.some(tag => n.tags?.includes(tag))
      );
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    if (filter.offset) {
      results = results.slice(filter.offset);
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async getEdgesForNode(
    nodeId: string,
    direction: 'incoming' | 'outgoing' | 'both' = 'both'
  ): Promise<ContextEdge[]> {
    const edgeIds = new Set<string>();

    if (direction === 'outgoing' || direction === 'both') {
      const outgoing = this.edgesBySource.get(nodeId) ?? new Set();
      outgoing.forEach(id => edgeIds.add(id));
    }

    if (direction === 'incoming' || direction === 'both') {
      const incoming = this.edgesByTarget.get(nodeId) ?? new Set();
      incoming.forEach(id => edgeIds.add(id));
    }

    return Array.from(edgeIds)
      .map(id => this.edges.get(id)!)
      .filter(Boolean);
  }

  async listEdges(filter: EdgeFilter): Promise<ContextEdge[]> {
    let results = Array.from(this.edges.values());

    if (filter.sourceId) {
      results = results.filter(e => e.sourceId === filter.sourceId);
    }
    if (filter.targetId) {
      results = results.filter(e => e.targetId === filter.targetId);
    }
    if (filter.type) {
      results = results.filter(e => e.type === filter.type);
    }
    if (filter.minConfidence !== undefined) {
      results = results.filter(e => e.confidence >= filter.minConfidence!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    return results;
  }

  async getSuccessors(nodeId: string): Promise<ContextNode[]> {
    const outgoingEdges = await this.getEdgesForNode(nodeId, 'outgoing');
    const successors: ContextNode[] = [];

    for (const edge of outgoingEdges) {
      const node = await this.getNode(edge.targetId);
      if (node) {
        successors.push(node);
      }
    }

    return successors;
  }

  async getPredecessors(nodeId: string): Promise<ContextNode[]> {
    const incomingEdges = await this.getEdgesForNode(nodeId, 'incoming');
    const predecessors: ContextNode[] = [];

    for (const edge of incomingEdges) {
      const node = await this.getNode(edge.sourceId);
      if (node) {
        predecessors.push(node);
      }
    }

    return predecessors;
  }

  // ==========================================================================
  // Trajectory Queries
  // ==========================================================================

  async getTrajectory(
    nodeId: string,
    maxDepth = 10
  ): Promise<TrajectoryResult> {
    const path: ContextNode[] = [];
    const edges: ContextEdge[] = [];
    let confidence = 1.0;

    let currentId = nodeId;
    const visited = new Set<string>();

    for (let depth = 0; depth <= maxDepth; depth++) {
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const node = await this.getNode(currentId);
      if (!node) break;

      path.unshift(node); // Add to beginning (building backwards)

      // Find incoming causal edges
      const incomingEdges = await this.listEdges({
        targetId: currentId,
        type: 'caused',
      });

      if (incomingEdges.length === 0) break;

      // Take the highest confidence edge
      const bestEdge = incomingEdges.reduce((best, edge) =>
        edge.confidence > best.confidence ? edge : best
      );

      edges.unshift(bestEdge);
      confidence *= bestEdge.confidence;
      currentId = bestEdge.sourceId;
    }

    return { path, edges, confidence };
  }

  async getConsequences(
    nodeId: string,
    maxDepth = 10
  ): Promise<TrajectoryResult> {
    const path: ContextNode[] = [];
    const edges: ContextEdge[] = [];
    let confidence = 1.0;

    const visited = new Set<string>();
    const queue = [{ id: nodeId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;

      if (visited.has(id) || depth > maxDepth) continue;
      visited.add(id);

      const node = await this.getNode(id);
      if (!node) continue;

      path.push(node);

      // Find outgoing causal edges
      const outgoingEdges = await this.listEdges({
        sourceId: id,
        type: 'caused',
      });

      for (const edge of outgoingEdges) {
        edges.push(edge);
        confidence *= edge.confidence;
        queue.push({ id: edge.targetId, depth: depth + 1 });
      }
    }

    return { path, edges, confidence };
  }

  // ==========================================================================
  // Precedent Queries
  // ==========================================================================

  async findPrecedents(
    embedding: number[],
    limit: number,
    filter?: NodeFilter
  ): Promise<PrecedentResult[]> {
    // Get candidate nodes
    const candidates = await this.listNodes({
      ...filter,
      type: 'decision',
      limit: limit * 10, // Get more candidates for similarity filtering
    });

    // Calculate similarity and sort
    const now = Date.now();
    const results: PrecedentResult[] = candidates
      .filter(node => node.embedding?.length)
      .map(node => ({
        node,
        similarity: this.cosineSimilarity(embedding, node.embedding!),
        age: now - node.timestamp.getTime(),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  }

  async findSimilarNodes(
    node: ContextNode,
    limit: number
  ): Promise<PrecedentResult[]> {
    if (!node.embedding) {
      return [];
    }

    return this.findPrecedents(node.embedding, limit, {
      type: node.type,
      tenantId: node.tenantId,
    });
  }

  // ==========================================================================
  // Cross-System Joins
  // ==========================================================================

  async inferEdges(
    sourceNodes: ContextNode[],
    targetNodes: ContextNode[],
    threshold: number,
    edgeType: ContextEdgeType = 'inferred'
  ): Promise<ContextEdge[]> {
    const inferredEdges: ContextEdge[] = [];

    for (const source of sourceNodes) {
      if (!source.embedding) continue;

      for (const target of targetNodes) {
        if (!target.embedding) continue;
        if (source.id === target.id) continue;

        const similarity = this.cosineSimilarity(
          source.embedding,
          target.embedding
        );

        if (similarity >= threshold) {
          const edge: ContextEdge = {
            id: `inferred_${source.id}_${target.id}`,
            sourceId: source.id,
            targetId: target.id,
            type: edgeType,
            confidence: similarity,
            timestamp: new Date(),
            metadata: { inferred: true, similarity },
          };

          inferredEdges.push(edge);
        }
      }
    }

    return inferredEdges;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  async getStats(tenantId?: string): Promise<{
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<ContextNodeType, number>;
    edgesByType: Record<ContextEdgeType, number>;
  }> {
    const nodes = tenantId
      ? Array.from(this.nodes.values()).filter(n => n.tenantId === tenantId)
      : Array.from(this.nodes.values());

    const nodesByType: Record<ContextNodeType, number> = {
      decision: 0,
      event: 0,
      entity: 0,
      artifact: 0,
      policy: 0,
    };

    for (const node of nodes) {
      nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
    }

    const edgesByType: Record<ContextEdgeType, number> = {
      caused: 0,
      approved: 0,
      referenced: 0,
      superseded: 0,
      blocked: 0,
      created: 0,
      modified: 0,
      triggered: 0,
      contributed: 0,
      inferred: 0,
    };

    for (const edge of this.edges.values()) {
      edgesByType[edge.type] = (edgesByType[edge.type] ?? 0) + 1;
    }

    return {
      nodeCount: nodes.length,
      edgeCount: this.edges.size,
      nodesByType,
      edgesByType,
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

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
    this.nodes.clear();
    this.edges.clear();
    this.edgesBySource.clear();
    this.edgesByTarget.clear();
  }

  /**
   * Get counts (for testing)
   */
  counts(): { nodes: number; edges: number } {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Generate a unique node ID
 */
export function generateNodeId(type: ContextNodeType = 'decision'): string {
  const prefix = type === 'decision' ? 'node' : type;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique edge ID
 */
export function generateEdgeId(type: ContextEdgeType = 'caused'): string {
  const prefix = type === 'caused' ? 'edge' : type;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a decision node from an agent decision trace
 */
export function createDecisionNode(
  tenantId: string,
  traceId: string,
  options: {
    action: string;
    agentType: string;
    runId: string;
    reasoning?: string;
    confidence?: number;
  },
  embedding?: number[]
): ContextNode {
  const { action, agentType, runId, reasoning, confidence } = options;
  return {
    id: generateNodeId('decision'),
    type: 'decision',
    timestamp: new Date(),
    tenantId,
    data: {
      traceId,
      runId,
      agentType,
      action,
      reasoning,
      confidence,
    },
    embedding,
    label: `${agentType}: ${action}`,
    tags: [agentType, action],
  };
}

/**
 * Create an event node
 */
export function createEventNode(
  tenantId: string,
  eventType: string,
  data: Record<string, unknown>,
  embedding?: number[]
): ContextNode {
  return {
    id: generateNodeId('event'),
    type: 'event',
    timestamp: new Date(),
    tenantId,
    data: {
      eventType,
      ...data,
    },
    embedding,
    label: eventType,
    tags: [eventType],
  };
}

/**
 * Create a causal edge
 */
export function createCausalEdge(
  _tenantId: string,
  sourceId: string,
  targetId: string,
  confidence = 1.0,
  metadata?: Record<string, unknown>
): ContextEdge {
  return {
    id: generateEdgeId('caused'),
    sourceId,
    targetId,
    type: 'caused',
    confidence,
    timestamp: new Date(),
    metadata,
  };
}

// =============================================================================
// Singleton Instance
// =============================================================================

let graphStoreInstance: ContextGraphStore | null = null;

/**
 * Get or create the global context graph store
 */
export function getContextGraphStore(): ContextGraphStore {
  if (!graphStoreInstance) {
    // Default to in-memory store
    // In production, this would be replaced with Firestore implementation
    graphStoreInstance = new InMemoryContextGraphStore();
  }
  return graphStoreInstance;
}

/**
 * Set the context graph store (for dependency injection)
 */
export function setContextGraphStore(store: ContextGraphStore): void {
  graphStoreInstance = store;
}

/**
 * Reset the context graph store (for testing)
 */
export function resetContextGraphStore(): void {
  graphStoreInstance = null;
}
