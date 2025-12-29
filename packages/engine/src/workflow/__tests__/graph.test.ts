/**
 * Graph Algorithm Tests
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowDefinition, StepDefinition } from '../schema.js';
import {
  buildAdjacencyList,
  buildReverseAdjacencyList,
  extractEdges,
  detectCycles,
  topologicalSort,
  findEntryPoints,
  findExitPoints,
  analyzeWorkflow,
  validateAcyclic,
  findReachableSteps,
  findPredecessors,
  computeCriticalPath,
  CycleDetectedError,
} from '../graph.js';

describe('buildAdjacencyList', () => {
  it('builds adjacency list for simple DAG', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['a'] },
    ];

    const adj = buildAdjacencyList(steps);

    expect(adj.get('a')).toEqual(['b', 'c']);
    expect(adj.get('b')).toEqual([]);
    expect(adj.get('c')).toEqual([]);
  });

  it('handles steps with no dependencies', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval' },
    ];

    const adj = buildAdjacencyList(steps);

    expect(adj.get('a')).toEqual([]);
    expect(adj.get('b')).toEqual([]);
  });

  it('handles complex dependency graph', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['a', 'b'] },
    ];

    const adj = buildAdjacencyList(steps);

    expect(adj.get('a')).toEqual(['b', 'c']);
    expect(adj.get('b')).toEqual(['c']);
    expect(adj.get('c')).toEqual([]);
  });

  it('handles parallel_group by connecting dependencies to all parallel steps', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'group', name: 'Group', type: 'parallel_group', dependsOn: ['a'], parallelSteps: ['b', 'c'] },
      { id: 'b', name: 'B', type: 'agent', agent: 'test-agent' },
      { id: 'c', name: 'C', type: 'agent', agent: 'test-agent' },
    ];

    const adj = buildAdjacencyList(steps);

    // 'a' should connect to both 'b' and 'c', not to 'group'
    expect(adj.get('a')).toEqual(expect.arrayContaining(['b', 'c']));
    expect(adj.get('a')).not.toContain('group');

    // 'group' should have no adjacency (not part of execution DAG)
    expect(adj.get('group')).toEqual([]);

    // 'b' and 'c' should have no dependents
    expect(adj.get('b')).toEqual([]);
    expect(adj.get('c')).toEqual([]);
  });

  it('handles parallel_group with dependents waiting for all parallel steps', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'group', name: 'Group', type: 'parallel_group', dependsOn: ['a'], parallelSteps: ['b', 'c'] },
      { id: 'b', name: 'B', type: 'agent', agent: 'test-agent' },
      { id: 'c', name: 'C', type: 'agent', agent: 'test-agent' },
      { id: 'd', name: 'D', type: 'approval', dependsOn: ['group'] },
    ];

    const adj = buildAdjacencyList(steps);

    // 'a' should connect to 'b' and 'c'
    expect(adj.get('a')).toEqual(expect.arrayContaining(['b', 'c']));

    // Both 'b' and 'c' should connect to 'd' (fan-in synchronization)
    expect(adj.get('b')).toEqual(['d']);
    expect(adj.get('c')).toEqual(['d']);

    // 'd' should have no dependents
    expect(adj.get('d')).toEqual([]);
  });

  it('handles parallel_group without dependencies (entry point)', () => {
    const steps: StepDefinition[] = [
      { id: 'group', name: 'Group', type: 'parallel_group', parallelSteps: ['a', 'b'] },
      { id: 'a', name: 'A', type: 'agent', agent: 'test-agent' },
      { id: 'b', name: 'B', type: 'agent', agent: 'test-agent' },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['group'] },
    ];

    const adj = buildAdjacencyList(steps);

    // 'a' and 'b' should both connect to 'c'
    expect(adj.get('a')).toEqual(['c']);
    expect(adj.get('b')).toEqual(['c']);

    // 'group' should have no adjacency
    expect(adj.get('group')).toEqual([]);
  });

  it('handles nested dependencies with parallel_group', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'group', name: 'Group', type: 'parallel_group', dependsOn: ['a'], parallelSteps: ['b', 'c'] },
      { id: 'b', name: 'B', type: 'agent', agent: 'test-agent' },
      { id: 'c', name: 'C', type: 'agent', agent: 'test-agent' },
      { id: 'd', name: 'D', type: 'approval', dependsOn: ['group'] },
      { id: 'e', name: 'E', type: 'approval', dependsOn: ['d'] },
    ];

    const adj = buildAdjacencyList(steps);

    // 'a' → 'b', 'c'
    expect(adj.get('a')).toEqual(expect.arrayContaining(['b', 'c']));

    // 'b', 'c' → 'd'
    expect(adj.get('b')).toEqual(['d']);
    expect(adj.get('c')).toEqual(['d']);

    // 'd' → 'e'
    expect(adj.get('d')).toEqual(['e']);

    // 'e' has no dependents
    expect(adj.get('e')).toEqual([]);
  });
});

describe('buildReverseAdjacencyList', () => {
  it('builds reverse adjacency list', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['a'] },
    ];

    const reverse = buildReverseAdjacencyList(steps);

    expect(reverse.get('a')).toEqual([]);
    expect(reverse.get('b')).toEqual(['a']);
    expect(reverse.get('c')).toEqual(['a']);
  });
});

describe('extractEdges', () => {
  it('extracts edges from workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'a', name: 'A', type: 'approval' },
        { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
        { id: 'c', name: 'C', type: 'approval', dependsOn: ['a', 'b'] },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    const edges = extractEdges(workflow);

    expect(edges).toHaveLength(3);
    expect(edges).toContainEqual({ from: 'a', to: 'b' });
    expect(edges).toContainEqual({ from: 'a', to: 'c' });
    expect(edges).toContainEqual({ from: 'b', to: 'c' });
  });

  it('returns empty for workflow with no dependencies', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'a', name: 'A', type: 'approval' },
        { id: 'b', name: 'B', type: 'approval' },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    const edges = extractEdges(workflow);
    expect(edges).toHaveLength(0);
  });
});

describe('detectCycles', () => {
  it('detects no cycles in DAG', () => {
    const adj = new Map<string, string[]>([
      ['a', ['b', 'c']],
      ['b', ['c']],
      ['c', []],
    ]);

    const cycles = detectCycles(adj);
    expect(cycles).toHaveLength(0);
  });

  it('detects simple cycle', () => {
    const adj = new Map<string, string[]>([
      ['a', ['b']],
      ['b', ['c']],
      ['c', ['a']],
    ]);

    const cycles = detectCycles(adj);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toEqual(['a', 'b', 'c', 'a']);
  });

  it('detects self-loop', () => {
    const adj = new Map<string, string[]>([
      ['a', ['a']],
    ]);

    const cycles = detectCycles(adj);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toEqual(['a', 'a']);
  });

  it('detects multiple cycles', () => {
    const adj = new Map<string, string[]>([
      ['a', ['b']],
      ['b', ['a']],
      ['c', ['d']],
      ['d', ['c']],
    ]);

    const cycles = detectCycles(adj);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe('topologicalSort', () => {
  it('sorts simple DAG', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['b'] },
    ];

    const sorted = topologicalSort(steps);

    expect(sorted).toEqual(['a', 'b', 'c']);
  });

  it('handles parallel branches', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['a'] },
      { id: 'd', name: 'D', type: 'approval', dependsOn: ['b', 'c'] },
    ];

    const sorted = topologicalSort(steps);

    expect(sorted[0]).toBe('a');
    expect(sorted[3]).toBe('d');
    // b and c can be in any order
    expect(['b', 'c']).toContain(sorted[1]);
    expect(['b', 'c']).toContain(sorted[2]);
  });

  it('throws on cycle', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval', dependsOn: ['c'] },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['b'] },
    ];

    expect(() => topologicalSort(steps)).toThrow(CycleDetectedError);
  });

  it('handles independent steps', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval' },
      { id: 'c', name: 'C', type: 'approval' },
    ];

    const sorted = topologicalSort(steps);

    expect(sorted).toHaveLength(3);
    expect(sorted).toContain('a');
    expect(sorted).toContain('b');
    expect(sorted).toContain('c');
  });

  it('handles parallel_group in topological sort', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'group', name: 'Group', type: 'parallel_group', dependsOn: ['a'], parallelSteps: ['b', 'c'] },
      { id: 'b', name: 'B', type: 'agent', agent: 'test-agent' },
      { id: 'c', name: 'C', type: 'agent', agent: 'test-agent' },
      { id: 'd', name: 'D', type: 'approval', dependsOn: ['group'] },
    ];

    const sorted = topologicalSort(steps);

    // 'a' should come first
    expect(sorted[0]).toBe('a');

    // 'b' and 'c' can be in any order, but both should come after 'a'
    const bIndex = sorted.indexOf('b');
    const cIndex = sorted.indexOf('c');
    const aIndex = sorted.indexOf('a');
    expect(bIndex).toBeGreaterThan(aIndex);
    expect(cIndex).toBeGreaterThan(aIndex);

    // 'd' should come after both 'b' and 'c'
    const dIndex = sorted.indexOf('d');
    expect(dIndex).toBeGreaterThan(bIndex);
    expect(dIndex).toBeGreaterThan(cIndex);

    // 'group' should be in the list but not in execution order
    expect(sorted).toContain('group');
  });
});

describe('findEntryPoints', () => {
  it('finds steps with no dependencies', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval' },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['a', 'b'] },
    ];

    const entries = findEntryPoints(steps);

    expect(entries).toHaveLength(2);
    expect(entries).toContain('a');
    expect(entries).toContain('b');
  });

  it('returns all steps when none have dependencies', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval' },
    ];

    const entries = findEntryPoints(steps);

    expect(entries).toHaveLength(2);
  });

  it('returns empty when all have dependencies (cycle)', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval', dependsOn: ['b'] },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
    ];

    const entries = findEntryPoints(steps);

    expect(entries).toHaveLength(0);
  });

  it('excludes parallel_group members from entry points', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'group', name: 'Group', type: 'parallel_group', dependsOn: ['a'], parallelSteps: ['b', 'c'] },
      { id: 'b', name: 'B', type: 'agent', agent: 'test-agent' },
      { id: 'c', name: 'C', type: 'agent', agent: 'test-agent' },
    ];

    const entries = findEntryPoints(steps);

    // Only 'a' should be an entry point, not 'b' or 'c' (even though they have no explicit dependsOn)
    expect(entries).toEqual(['a']);
  });

  it('includes parallel_group itself as entry point if it has no dependencies', () => {
    const steps: StepDefinition[] = [
      { id: 'group', name: 'Group', type: 'parallel_group', parallelSteps: ['a', 'b'] },
      { id: 'a', name: 'A', type: 'agent', agent: 'test-agent' },
      { id: 'b', name: 'B', type: 'agent', agent: 'test-agent' },
    ];

    const entries = findEntryPoints(steps);

    // The group itself is the entry point, not the parallel steps
    expect(entries).toEqual(['group']);
  });
});

describe('findExitPoints', () => {
  it('finds steps with no dependents', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['a'] },
    ];

    const exits = findExitPoints(steps);

    expect(exits).toHaveLength(2);
    expect(exits).toContain('b');
    expect(exits).toContain('c');
  });

  it('returns all when none are depended on', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval' },
    ];

    const exits = findExitPoints(steps);

    expect(exits).toHaveLength(2);
  });

  it('correctly identifies exit points with parallel_group', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'group', name: 'Group', type: 'parallel_group', dependsOn: ['a'], parallelSteps: ['b', 'c'] },
      { id: 'b', name: 'B', type: 'agent', agent: 'test-agent' },
      { id: 'c', name: 'C', type: 'agent', agent: 'test-agent' },
      { id: 'd', name: 'D', type: 'approval', dependsOn: ['group'] },
    ];

    const exits = findExitPoints(steps);

    // Only 'd' should be an exit point (the parallel steps have dependents)
    expect(exits).toEqual(['d']);
  });

  it('excludes parallel_group itself from exit points', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'group', name: 'Group', type: 'parallel_group', dependsOn: ['a'], parallelSteps: ['b', 'c'] },
      { id: 'b', name: 'B', type: 'agent', agent: 'test-agent' },
      { id: 'c', name: 'C', type: 'agent', agent: 'test-agent' },
    ];

    const exits = findExitPoints(steps);

    // 'b' and 'c' are exit points, but not 'group' (it's not a real execution node)
    expect(exits).toHaveLength(2);
    expect(exits).toContain('b');
    expect(exits).toContain('c');
  });
});

describe('analyzeWorkflow', () => {
  it('analyzes simple DAG', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'a', name: 'A', type: 'approval' },
        { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
        { id: 'c', name: 'C', type: 'approval', dependsOn: ['b'] },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    const analysis = analyzeWorkflow(workflow);

    expect(analysis.isAcyclic).toBe(true);
    expect(analysis.cycles).toHaveLength(0);
    expect(analysis.topologicalOrder).toEqual(['a', 'b', 'c']);
    expect(analysis.entryPoints).toEqual(['a']);
    expect(analysis.exitPoints).toEqual(['c']);
    expect(analysis.edgeCount).toBe(2);
  });

  it('analyzes workflow with cycle', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'a', name: 'A', type: 'approval', dependsOn: ['b'] },
        { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    const analysis = analyzeWorkflow(workflow);

    expect(analysis.isAcyclic).toBe(false);
    expect(analysis.cycles.length).toBeGreaterThan(0);
    expect(analysis.topologicalOrder).toBeUndefined();
  });

  it('analyzes parallel workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'a', name: 'A', type: 'approval' },
        { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
        { id: 'c', name: 'C', type: 'approval', dependsOn: ['a'] },
        { id: 'd', name: 'D', type: 'approval', dependsOn: ['b', 'c'] },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    const analysis = analyzeWorkflow(workflow);

    expect(analysis.isAcyclic).toBe(true);
    expect(analysis.entryPoints).toEqual(['a']);
    expect(analysis.exitPoints).toEqual(['d']);
    expect(analysis.edgeCount).toBe(4);
  });

  it('analyzes workflow with parallel_group correctly', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'triage', name: 'Triage', type: 'agent', agent: 'triage-agent' },
        { id: 'parallel-analysis', name: 'Parallel Analysis', type: 'parallel_group', dependsOn: ['triage'], parallelSteps: ['security-scan', 'performance-check', 'code-review'] },
        { id: 'security-scan', name: 'Security Scan', type: 'agent', agent: 'security-scanner' },
        { id: 'performance-check', name: 'Performance Check', type: 'agent', agent: 'performance-analyzer' },
        { id: 'code-review', name: 'Code Review', type: 'agent', agent: 'reviewer-agent' },
        { id: 'merge', name: 'Merge', type: 'agent', agent: 'merge-agent', dependsOn: ['parallel-analysis'] },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    const analysis = analyzeWorkflow(workflow);

    expect(analysis.isAcyclic).toBe(true);

    // Entry point should be 'triage' (not the parallel steps)
    expect(analysis.entryPoints).toEqual(['triage']);

    // Exit point should be 'merge'
    expect(analysis.exitPoints).toEqual(['merge']);

    // Should have edges: triage→parallel-analysis, parallel-analysis→merge
    expect(analysis.edgeCount).toBe(2);

    // Should have topological order
    expect(analysis.topologicalOrder).toBeDefined();
    if (analysis.topologicalOrder) {
      // 'triage' should come first
      expect(analysis.topologicalOrder[0]).toBe('triage');

      // Parallel steps should come after triage
      const triageIndex = analysis.topologicalOrder.indexOf('triage');
      const securityIndex = analysis.topologicalOrder.indexOf('security-scan');
      const performanceIndex = analysis.topologicalOrder.indexOf('performance-check');
      const reviewIndex = analysis.topologicalOrder.indexOf('code-review');

      expect(securityIndex).toBeGreaterThan(triageIndex);
      expect(performanceIndex).toBeGreaterThan(triageIndex);
      expect(reviewIndex).toBeGreaterThan(triageIndex);

      // 'merge' should come after all parallel steps
      const mergeIndex = analysis.topologicalOrder.indexOf('merge');
      expect(mergeIndex).toBeGreaterThan(securityIndex);
      expect(mergeIndex).toBeGreaterThan(performanceIndex);
      expect(mergeIndex).toBeGreaterThan(reviewIndex);
    }
  });
});

describe('validateAcyclic', () => {
  it('passes for acyclic workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'a', name: 'A', type: 'approval' },
        { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    expect(() => validateAcyclic(workflow)).not.toThrow();
  });

  it('throws for cyclic workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'a', name: 'A', type: 'approval', dependsOn: ['b'] },
        { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    expect(() => validateAcyclic(workflow)).toThrow(CycleDetectedError);
  });
});

describe('findReachableSteps', () => {
  it('finds all reachable steps', () => {
    const adj = new Map<string, string[]>([
      ['a', ['b', 'c']],
      ['b', ['d']],
      ['c', ['d']],
      ['d', []],
    ]);

    const reachable = findReachableSteps('a', adj);

    expect(reachable.size).toBe(4);
    expect(reachable).toContain('a');
    expect(reachable).toContain('b');
    expect(reachable).toContain('c');
    expect(reachable).toContain('d');
  });

  it('handles single node', () => {
    const adj = new Map<string, string[]>([['a', []]]);

    const reachable = findReachableSteps('a', adj);

    expect(reachable.size).toBe(1);
    expect(reachable).toContain('a');
  });

  it('handles disconnected graph', () => {
    const adj = new Map<string, string[]>([
      ['a', ['b']],
      ['b', []],
      ['c', ['d']],
      ['d', []],
    ]);

    const reachable = findReachableSteps('a', adj);

    expect(reachable.size).toBe(2);
    expect(reachable).toContain('a');
    expect(reachable).toContain('b');
    expect(reachable).not.toContain('c');
    expect(reachable).not.toContain('d');
  });
});

describe('findPredecessors', () => {
  it('finds all predecessors', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['b'] },
      { id: 'd', name: 'D', type: 'approval', dependsOn: ['c'] },
    ];

    const predecessors = findPredecessors('d', steps);

    expect(predecessors.size).toBe(3);
    expect(predecessors).toContain('a');
    expect(predecessors).toContain('b');
    expect(predecessors).toContain('c');
  });

  it('returns empty for entry point', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
    ];

    const predecessors = findPredecessors('a', steps);

    expect(predecessors.size).toBe(0);
  });

  it('handles diamond dependency', () => {
    const steps: StepDefinition[] = [
      { id: 'a', name: 'A', type: 'approval' },
      { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
      { id: 'c', name: 'C', type: 'approval', dependsOn: ['a'] },
      { id: 'd', name: 'D', type: 'approval', dependsOn: ['b', 'c'] },
    ];

    const predecessors = findPredecessors('d', steps);

    expect(predecessors.size).toBe(3);
    expect(predecessors).toContain('a');
    expect(predecessors).toContain('b');
    expect(predecessors).toContain('c');
  });
});

describe('computeCriticalPath', () => {
  it('computes critical path for linear workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'a', name: 'A', type: 'approval' },
        { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
        { id: 'c', name: 'C', type: 'approval', dependsOn: ['b'] },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    const criticalPath = computeCriticalPath(workflow);

    expect(criticalPath.get('a')).toBe(0);
    expect(criticalPath.get('b')).toBe(1);
    expect(criticalPath.get('c')).toBe(2);
  });

  it('computes critical path for diamond dependency', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'a', name: 'A', type: 'approval' },
        { id: 'b', name: 'B', type: 'approval', dependsOn: ['a'] },
        { id: 'c', name: 'C', type: 'approval', dependsOn: ['a'] },
        { id: 'd', name: 'D', type: 'approval', dependsOn: ['b', 'c'] },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    const criticalPath = computeCriticalPath(workflow);

    expect(criticalPath.get('a')).toBe(0);
    expect(criticalPath.get('b')).toBe(1);
    expect(criticalPath.get('c')).toBe(1);
    expect(criticalPath.get('d')).toBe(2);
  });

  it('handles parallel entry points', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        { id: 'a', name: 'A', type: 'approval' },
        { id: 'b', name: 'B', type: 'approval' },
        { id: 'c', name: 'C', type: 'approval', dependsOn: ['a', 'b'] },
      ],
      triggers: [{ type: 'manual', config: {} }],
    };

    const criticalPath = computeCriticalPath(workflow);

    expect(criticalPath.get('a')).toBe(0);
    expect(criticalPath.get('b')).toBe(0);
    expect(criticalPath.get('c')).toBe(1);
  });
});
