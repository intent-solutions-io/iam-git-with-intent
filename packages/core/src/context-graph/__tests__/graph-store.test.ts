/**
 * Graph Store Tests
 *
 * Phase 35: Context Graph - Tests for event-sourced graph storage.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  type ContextNode,
  type ContextEdge,
  type ContextNodeType,
  type ContextEdgeType,
  InMemoryContextGraphStore,
  generateNodeId,
  generateEdgeId,
  createDecisionNode,
  createEventNode,
  createCausalEdge,
  getContextGraphStore,
  setContextGraphStore,
  resetContextGraphStore,
} from '../graph-store.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestNode(overrides?: Partial<ContextNode>): ContextNode {
  return {
    id: generateNodeId(),
    type: 'decision',
    timestamp: new Date(),
    tenantId: 'tenant-1',
    data: { action: 'test', agentType: 'coder' },
    ...overrides,
  };
}

function createTestEdge(
  sourceId: string,
  targetId: string,
  overrides?: Partial<ContextEdge>
): ContextEdge {
  return {
    id: generateEdgeId(),
    sourceId,
    targetId,
    type: 'caused',
    confidence: 1.0,
    timestamp: new Date(),
    tenantId: 'tenant-1',
    ...overrides,
  };
}

// =============================================================================
// InMemoryContextGraphStore Tests
// =============================================================================

describe('InMemoryContextGraphStore', () => {
  let store: InMemoryContextGraphStore;

  beforeEach(() => {
    store = new InMemoryContextGraphStore();
  });

  describe('Node Operations', () => {
    describe('addNode', () => {
      it('should add a node', async () => {
        const node = createTestNode();
        await store.addNode(node);

        const retrieved = await store.getNode(node.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(node.id);
      });

      it('should add multiple nodes', async () => {
        const node1 = createTestNode({ id: 'node-1' });
        const node2 = createTestNode({ id: 'node-2' });

        await store.addNode(node1);
        await store.addNode(node2);

        expect(await store.getNode('node-1')).toBeDefined();
        expect(await store.getNode('node-2')).toBeDefined();
      });
    });

    describe('getNode', () => {
      it('should return null for non-existent node', async () => {
        const result = await store.getNode('non-existent');
        expect(result).toBeNull();
      });
    });

    describe('listNodes', () => {
      beforeEach(async () => {
        await store.addNode(createTestNode({ id: 'n1', type: 'decision', tenantId: 'tenant-a' }));
        await store.addNode(createTestNode({ id: 'n2', type: 'event', tenantId: 'tenant-a' }));
        await store.addNode(createTestNode({ id: 'n3', type: 'decision', tenantId: 'tenant-b' }));
      });

      it('should list all nodes', async () => {
        const nodes = await store.listNodes({});
        expect(nodes.length).toBe(3);
      });

      it('should filter by type', async () => {
        const nodes = await store.listNodes({ type: 'decision' });
        expect(nodes.length).toBe(2);
      });

      it('should filter by tenantId', async () => {
        const nodes = await store.listNodes({ tenantId: 'tenant-a' });
        expect(nodes.length).toBe(2);
      });

      it('should combine filters', async () => {
        const nodes = await store.listNodes({
          type: 'decision',
          tenantId: 'tenant-a',
        });
        expect(nodes.length).toBe(1);
        expect(nodes[0].id).toBe('n1');
      });

      it('should respect limit', async () => {
        const nodes = await store.listNodes({ limit: 2 });
        expect(nodes.length).toBe(2);
      });
    });

    describe('deleteNode', () => {
      it('should delete a node and its edges', async () => {
        const node1 = createTestNode({ id: 'n1' });
        const node2 = createTestNode({ id: 'n2' });
        await store.addNode(node1);
        await store.addNode(node2);

        const edge = createTestEdge('n1', 'n2');
        await store.addEdge(edge);

        await store.deleteNode('n1');

        expect(await store.getNode('n1')).toBeNull();
        const edges = await store.listEdges({ sourceId: 'n1' });
        expect(edges.length).toBe(0);
      });
    });
  });

  describe('Edge Operations', () => {
    let node1: ContextNode;
    let node2: ContextNode;
    let node3: ContextNode;

    beforeEach(async () => {
      node1 = createTestNode({ id: 'n1' });
      node2 = createTestNode({ id: 'n2' });
      node3 = createTestNode({ id: 'n3' });
      await store.addNode(node1);
      await store.addNode(node2);
      await store.addNode(node3);
    });

    describe('addEdge', () => {
      it('should add an edge', async () => {
        const edge = createTestEdge('n1', 'n2');
        await store.addEdge(edge);

        const retrieved = await store.getEdge(edge.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.sourceId).toBe('n1');
        expect(retrieved?.targetId).toBe('n2');
      });
    });

    describe('listEdges', () => {
      beforeEach(async () => {
        await store.addEdge(createTestEdge('n1', 'n2', { id: 'e1', type: 'caused' }));
        await store.addEdge(createTestEdge('n2', 'n3', { id: 'e2', type: 'approved' }));
        await store.addEdge(createTestEdge('n1', 'n3', { id: 'e3', type: 'caused' }));
      });

      it('should list all edges', async () => {
        const edges = await store.listEdges({});
        expect(edges.length).toBe(3);
      });

      it('should filter by sourceId', async () => {
        const edges = await store.listEdges({ sourceId: 'n1' });
        expect(edges.length).toBe(2);
      });

      it('should filter by targetId', async () => {
        const edges = await store.listEdges({ targetId: 'n3' });
        expect(edges.length).toBe(2);
      });

      it('should filter by type', async () => {
        const edges = await store.listEdges({ type: 'caused' });
        expect(edges.length).toBe(2);
      });
    });
  });

  describe('Trajectory Queries', () => {
    beforeEach(async () => {
      // Create a chain: n1 -> n2 -> n3 -> n4
      await store.addNode(createTestNode({ id: 'n1', data: { step: 1 } }));
      await store.addNode(createTestNode({ id: 'n2', data: { step: 2 } }));
      await store.addNode(createTestNode({ id: 'n3', data: { step: 3 } }));
      await store.addNode(createTestNode({ id: 'n4', data: { step: 4 } }));

      await store.addEdge(createTestEdge('n1', 'n2'));
      await store.addEdge(createTestEdge('n2', 'n3'));
      await store.addEdge(createTestEdge('n3', 'n4'));
    });

    describe('getTrajectory', () => {
      it('should return full trajectory to a node', async () => {
        const result = await store.getTrajectory('n4');

        expect(result.path.length).toBe(4);
        expect(result.edges.length).toBe(3);
        expect(result.path[0].id).toBe('n1');
        expect(result.path[3].id).toBe('n4');
      });

      it('should respect maxDepth', async () => {
        const result = await store.getTrajectory('n4', 2);

        expect(result.path.length).toBe(3);
        expect(result.path[0].id).toBe('n2');
      });

      it('should handle node with no predecessors', async () => {
        const result = await store.getTrajectory('n1');

        expect(result.path.length).toBe(1);
        expect(result.edges.length).toBe(0);
      });

      it('should return empty for non-existent node', async () => {
        const result = await store.getTrajectory('non-existent');

        expect(result.path.length).toBe(0);
        expect(result.edges.length).toBe(0);
      });
    });

    describe('getSuccessors', () => {
      it('should return successor nodes', async () => {
        const successors = await store.getSuccessors('n1');

        expect(successors.length).toBe(1);
        expect(successors[0].id).toBe('n2');
      });

      it('should return empty for leaf node', async () => {
        const successors = await store.getSuccessors('n4');
        expect(successors.length).toBe(0);
      });
    });

    describe('getPredecessors', () => {
      it('should return predecessor nodes', async () => {
        const predecessors = await store.getPredecessors('n3');

        expect(predecessors.length).toBe(1);
        expect(predecessors[0].id).toBe('n2');
      });

      it('should return empty for root node', async () => {
        const predecessors = await store.getPredecessors('n1');
        expect(predecessors.length).toBe(0);
      });
    });
  });

  describe('Precedent Search', () => {
    beforeEach(async () => {
      // Create nodes with embeddings
      await store.addNode(createTestNode({
        id: 'n1',
        type: 'decision',
        embedding: [1, 0, 0],
        data: { action: 'merge' },
      }));
      await store.addNode(createTestNode({
        id: 'n2',
        type: 'decision',
        embedding: [0.9, 0.1, 0],
        data: { action: 'merge-similar' },
      }));
      await store.addNode(createTestNode({
        id: 'n3',
        type: 'decision',
        embedding: [0, 1, 0],
        data: { action: 'review' },
      }));
    });

    describe('findPrecedents', () => {
      it('should find similar nodes by embedding', async () => {
        const queryEmbedding = [1, 0, 0];
        const results = await store.findPrecedents(queryEmbedding, 2);

        expect(results.length).toBe(2);
        expect(results[0].node.id).toBe('n1');
        expect(results[0].similarity).toBeCloseTo(1.0, 2);
      });

      it('should respect limit', async () => {
        const queryEmbedding = [1, 0, 0];
        const results = await store.findPrecedents(queryEmbedding, 1);

        expect(results.length).toBe(1);
      });

      it('should filter by node type', async () => {
        await store.addNode(createTestNode({
          id: 'n4',
          type: 'event',
          embedding: [1, 0, 0],
        }));

        const results = await store.findPrecedents([1, 0, 0], 10, { type: 'decision' });

        expect(results.every(r => r.node.type === 'decision')).toBe(true);
      });
    });
  });

  describe('Edge Inference', () => {
    beforeEach(async () => {
      await store.addNode(createTestNode({
        id: 'n1',
        embedding: [1, 0, 0],
      }));
      await store.addNode(createTestNode({
        id: 'n2',
        embedding: [0.95, 0.05, 0],
      }));
      await store.addNode(createTestNode({
        id: 'n3',
        embedding: [0, 1, 0],
      }));
    });

    describe('inferEdges', () => {
      it('should infer edges between similar nodes', async () => {
        const sources = [await store.getNode('n1')].filter((n): n is ContextNode => n !== null);
        const targets = [
          await store.getNode('n2'),
          await store.getNode('n3'),
        ].filter((n): n is ContextNode => n !== null);

        const edges = await store.inferEdges(sources, targets, 0.9, 'caused');

        expect(edges.length).toBe(1);
        expect(edges[0].sourceId).toBe('n1');
        expect(edges[0].targetId).toBe('n2');
        expect(edges[0].confidence).toBeGreaterThan(0.9);
      });

      it('should return empty for dissimilar nodes', async () => {
        const sources = [await store.getNode('n1')].filter((n): n is ContextNode => n !== null);
        const targets = [await store.getNode('n3')].filter((n): n is ContextNode => n !== null);

        const edges = await store.inferEdges(sources, targets, 0.9, 'caused');

        expect(edges.length).toBe(0);
      });
    });
  });
});

// =============================================================================
// Factory Functions Tests
// =============================================================================

describe('Factory Functions', () => {
  afterEach(() => {
    resetContextGraphStore();
  });

  describe('generateNodeId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateNodeId();
      const id2 = generateNodeId();

      expect(id1).toMatch(/^node_/);
      expect(id2).toMatch(/^node_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateEdgeId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateEdgeId();
      const id2 = generateEdgeId();

      expect(id1).toMatch(/^edge_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createDecisionNode', () => {
    it('should create a valid decision node', () => {
      const node = createDecisionNode('tenant-1', 'trace-123', {
        action: 'generate_code',
        agentType: 'coder',
        runId: 'run-123',
      });

      expect(node.type).toBe('decision');
      expect(node.tenantId).toBe('tenant-1');
      expect(node.data.traceId).toBe('trace-123');
      expect(node.data.action).toBe('generate_code');
    });
  });

  describe('createEventNode', () => {
    it('should create a valid event node', () => {
      const node = createEventNode('tenant-1', 'issue.created', {
        issueNumber: 42,
        repo: 'owner/repo',
      });

      expect(node.type).toBe('event');
      expect(node.data.eventType).toBe('issue.created');
      expect(node.data.issueNumber).toBe(42);
    });
  });

  describe('createCausalEdge', () => {
    it('should create a causal edge', () => {
      const edge = createCausalEdge('tenant-1', 'node-1', 'node-2', 0.95);

      expect(edge.type).toBe('caused');
      expect(edge.sourceId).toBe('node-1');
      expect(edge.targetId).toBe('node-2');
      expect(edge.confidence).toBe(0.95);
    });
  });

  describe('Singleton Store', () => {
    it('should return same instance', () => {
      const store1 = getContextGraphStore();
      const store2 = getContextGraphStore();

      expect(store1).toBe(store2);
    });

    it('should allow setting custom store', () => {
      const customStore = new InMemoryContextGraphStore();
      setContextGraphStore(customStore);

      expect(getContextGraphStore()).toBe(customStore);
    });
  });
});
