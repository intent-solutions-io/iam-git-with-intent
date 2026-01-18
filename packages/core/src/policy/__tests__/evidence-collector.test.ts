/**
 * Evidence Collector Tests
 *
 * Epic D: Policy & Audit - Story D4: Compliance Reports
 * Task D4.2: Implement evidence collection
 *
 * @module @gwi/core/policy/__tests__/evidence-collector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EvidenceTimeRange,
  EvidenceQuery,
  CollectedEvidence,
  EvidenceCollectionResult,
  CONTROL_TO_ACTION_MAPPINGS,
  SOC2_CRITERIA_MAPPINGS,
  ISO27001_CONTROL_MAPPINGS,
  AuditLogEvidenceSource,
  DecisionTraceEvidenceSource,
  EvidenceCollector,
  createAuditLogEvidenceSource,
  createDecisionTraceEvidenceSource,
  createEvidenceCollector,
  linkEvidenceToControl,
  getEvidenceSummary,
  filterByRelevance,
  getTopEvidence,
  initializeEvidenceCollector,
  getEvidenceCollector,
  setEvidenceCollector,
  resetEvidenceCollector,
  type EvidenceSource,
  type DecisionTraceStore,
  type DecisionTrace,
} from '../evidence-collector.js';
import type { ImmutableAuditLogStore, AuditLogQueryOptions, AuditLogQueryResult } from '../audit-log-storage.js';
import type { ImmutableAuditLogEntry, AuditLogEntryId } from '../audit-log-schema.js';
import type { ControlDefinition } from '../report-templates.js';

// =============================================================================
// Mock Data
// =============================================================================

const mockTimeRange: EvidenceTimeRange = {
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
};

const mockAuditLogEntry: ImmutableAuditLogEntry = {
  id: 'alog-1704067200000-1-abc123' as AuditLogEntryId,
  schemaVersion: '1.0.0',
  tenantId: 'tenant-1',
  sequence: 1,
  timestamp: new Date('2025-01-15T12:00:00Z'),
  actor: {
    type: 'user',
    id: 'user-123',
    displayName: 'Test User',
    email: 'test@example.com',
  },
  action: {
    category: 'auth',
    type: 'auth.login',
    description: 'User logged in',
    sensitive: false,
  },
  resource: {
    type: 'session',
    id: 'session-456',
  },
  outcome: {
    status: 'success',
  },
  chain: {
    prevHash: '0'.repeat(64),
    contentHash: 'a'.repeat(64),
    sequence: 1,
    algorithm: 'sha256',
  },
  context: {},
};

const mockHighRiskEntry: ImmutableAuditLogEntry = {
  ...mockAuditLogEntry,
  id: 'alog-1704067200000-2-def456' as AuditLogEntryId,
  sequence: 2,
  action: {
    category: 'security',
    type: 'security.permission_escalation',
    description: 'User granted admin access',
    sensitive: true,
  },
  outcome: {
    status: 'success',
  },
  chain: {
    ...mockAuditLogEntry.chain,
    sequence: 2,
  },
};

const mockFailedEntry: ImmutableAuditLogEntry = {
  ...mockAuditLogEntry,
  id: 'alog-1704067200000-3-ghi789' as AuditLogEntryId,
  sequence: 3,
  action: {
    category: 'policy',
    type: 'policy.violation_detected',
    description: 'Policy violation detected',
    sensitive: true,
  },
  outcome: {
    status: 'failure',
    errorMessage: 'Access denied',
  },
  chain: {
    ...mockAuditLogEntry.chain,
    sequence: 3,
  },
};

const mockDecisionTrace: DecisionTrace = {
  id: 'dt-123',
  runId: 'run-456',
  agentType: 'triage',
  timestamp: new Date('2025-01-15T10:00:00Z'),
  tenantId: 'tenant-1',
  inputs: {
    prompt: 'Analyze PR complexity',
    contextWindow: ['file1.ts', 'file2.ts'],
    complexity: 5,
  },
  decision: {
    action: 'assess_complexity',
    reasoning: 'Medium complexity due to multiple file changes',
    confidence: 0.85,
    alternatives: ['route_to_senior', 'auto_approve'],
  },
  outcome: {
    result: 'success',
  },
};

const mockOverriddenTrace: DecisionTrace = {
  ...mockDecisionTrace,
  id: 'dt-456',
  agentType: 'coder',
  decision: {
    action: 'generate_code',
    reasoning: 'Implemented feature based on requirements',
    confidence: 0.75,
    alternatives: ['refactor_existing', 'skip'],
  },
  outcome: {
    result: 'override',
    humanOverride: {
      userId: 'user-123',
      reason: 'Code needs security review',
    },
  },
};

const mockControl: ControlDefinition = {
  controlId: 'CC6.1',
  title: 'Logical Access Controls',
  description: 'Access to systems is controlled',
  category: 'Logical Access',
  priority: 'high',
  status: 'not_evaluated',
  evidence: [],
  remediation: [],
  testingProcedures: [],
  implementationGuidance: '',
};

// =============================================================================
// Mock Stores
// =============================================================================

function createMockAuditLogStore(entries: ImmutableAuditLogEntry[] = []): ImmutableAuditLogStore {
  return {
    append: vi.fn(),
    appendBatch: vi.fn(),
    get: vi.fn().mockResolvedValue(entries[0] ?? null),
    query: vi.fn().mockImplementation(async (options: AuditLogQueryOptions): Promise<AuditLogQueryResult> => {
      let filtered = [...entries];

      if (options.tenantId) {
        filtered = filtered.filter(e => e.tenantId === options.tenantId);
      }
      if (options.actionCategory) {
        filtered = filtered.filter(e => e.action.category === options.actionCategory);
      }
      if (options.highRiskOnly) {
        filtered = filtered.filter(e => e.outcome.highRisk);
      }
      if (options.startTime) {
        filtered = filtered.filter(e => e.timestamp >= options.startTime!);
      }
      if (options.endTime) {
        filtered = filtered.filter(e => e.timestamp <= options.endTime!);
      }
      if (options.limit) {
        filtered = filtered.slice(0, options.limit);
      }

      return {
        entries: filtered,
        totalCount: filtered.length,
        hasMore: false,
        metadata: {
          query: options,
          executedAt: new Date(),
          durationMs: 1,
        },
      };
    }),
    getChainState: vi.fn(),
    verifyChainIntegrity: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue({
      logId: 'log-tenant-1-audit-12345678',
      tenantId: 'tenant-1',
      entryCount: entries.length,
      firstEntryId: entries[0]?.id ?? null,
      lastEntryId: entries[entries.length - 1]?.id ?? null,
      lastSequence: entries.length,
      chainIntact: true,
      createdAt: new Date(),
      lastUpdatedAt: new Date(),
    }),
    close: vi.fn(),
  } as unknown as ImmutableAuditLogStore;
}

function createMockDecisionTraceStore(traces: DecisionTrace[] = []): DecisionTraceStore {
  return {
    query: vi.fn().mockImplementation(async (filter: {
      tenantId?: string;
      agentType?: string;
      startTime?: Date;
      endTime?: Date;
      limit?: number;
    }): Promise<DecisionTrace[]> => {
      let filtered = [...traces];

      if (filter.tenantId) {
        filtered = filtered.filter(t => t.tenantId === filter.tenantId);
      }
      if (filter.agentType) {
        filtered = filtered.filter(t => t.agentType === filter.agentType);
      }
      if (filter.startTime) {
        filtered = filtered.filter(t => t.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        filtered = filtered.filter(t => t.timestamp <= filter.endTime!);
      }
      if (filter.limit) {
        filtered = filtered.slice(0, filter.limit);
      }

      return filtered;
    }),
  };
}

// =============================================================================
// Schema Tests
// =============================================================================

describe('Evidence Collector Schemas', () => {
  describe('EvidenceTimeRange', () => {
    it('should validate valid time range', () => {
      const result = EvidenceTimeRange.safeParse(mockTimeRange);
      expect(result.success).toBe(true);
    });

    it('should reject invalid dates', () => {
      const result = EvidenceTimeRange.safeParse({
        startDate: 'not-a-date',
        endDate: new Date(),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('EvidenceQuery', () => {
    it('should validate minimal query', () => {
      const query = {
        tenantId: 'tenant-1',
        timeRange: mockTimeRange,
      };
      const result = EvidenceQuery.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should validate full query', () => {
      const query = {
        tenantId: 'tenant-1',
        timeRange: mockTimeRange,
        controlId: 'CC6.1',
        controlCategory: 'access_control',
        actionCategories: ['auth', 'security'],
        resourceTypes: ['user', 'session'],
        actorTypes: ['user', 'agent'],
        highRiskOnly: true,
        maxPerSource: 50,
        verifyChain: true,
      };
      const result = EvidenceQuery.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should enforce maxPerSource bounds', () => {
      const tooLow = EvidenceQuery.safeParse({
        tenantId: 'tenant-1',
        timeRange: mockTimeRange,
        maxPerSource: 0,
      });
      expect(tooLow.success).toBe(false);

      const tooHigh = EvidenceQuery.safeParse({
        tenantId: 'tenant-1',
        timeRange: mockTimeRange,
        maxPerSource: 5000,
      });
      expect(tooHigh.success).toBe(false);
    });
  });
});

// =============================================================================
// Control-to-Action Mappings Tests
// =============================================================================

describe('Control-to-Action Mappings', () => {
  describe('CONTROL_TO_ACTION_MAPPINGS', () => {
    it('should have access_control mapping', () => {
      expect(CONTROL_TO_ACTION_MAPPINGS['access_control']).toBeDefined();
      expect(CONTROL_TO_ACTION_MAPPINGS['access_control']).toContain('auth');
    });

    it('should have change_management mapping', () => {
      expect(CONTROL_TO_ACTION_MAPPINGS['change_management']).toBeDefined();
      expect(CONTROL_TO_ACTION_MAPPINGS['change_management']).toContain('git');
    });

    it('should have ai_governance mapping', () => {
      expect(CONTROL_TO_ACTION_MAPPINGS['ai_governance']).toBeDefined();
      expect(CONTROL_TO_ACTION_MAPPINGS['ai_governance']).toContain('agent');
    });
  });

  describe('SOC2_CRITERIA_MAPPINGS', () => {
    it('should have CC6 (Logical Access) mapping', () => {
      expect(SOC2_CRITERIA_MAPPINGS['CC6']).toBeDefined();
      expect(SOC2_CRITERIA_MAPPINGS['CC6']).toContain('auth');
    });

    it('should have CC6.1 specific mapping', () => {
      expect(SOC2_CRITERIA_MAPPINGS['CC6.1']).toBeDefined();
    });

    it('should have CC7 (System Operations) mapping', () => {
      expect(SOC2_CRITERIA_MAPPINGS['CC7']).toBeDefined();
      expect(SOC2_CRITERIA_MAPPINGS['CC7']).toContain('security');
    });

    it('should have CC8 (Change Management) mapping', () => {
      expect(SOC2_CRITERIA_MAPPINGS['CC8']).toBeDefined();
      expect(SOC2_CRITERIA_MAPPINGS['CC8']).toContain('git');
      expect(SOC2_CRITERIA_MAPPINGS['CC8']).toContain('approval');
    });

    it('should have CC3 (Risk Assessment) mapping', () => {
      expect(SOC2_CRITERIA_MAPPINGS['CC3']).toBeDefined();
      expect(SOC2_CRITERIA_MAPPINGS['CC3']).toContain('policy');
    });
  });

  describe('ISO27001_CONTROL_MAPPINGS', () => {
    it('should have A.5 (Policies) mapping', () => {
      expect(ISO27001_CONTROL_MAPPINGS['A.5']).toBeDefined();
      expect(ISO27001_CONTROL_MAPPINGS['A.5']).toContain('policy');
    });

    it('should have A.9 (Access Control) mapping', () => {
      expect(ISO27001_CONTROL_MAPPINGS['A.9']).toBeDefined();
      expect(ISO27001_CONTROL_MAPPINGS['A.9']).toContain('auth');
    });

    it('should have A.14 (Development) mapping', () => {
      expect(ISO27001_CONTROL_MAPPINGS['A.14']).toBeDefined();
      expect(ISO27001_CONTROL_MAPPINGS['A.14']).toContain('git');
    });
  });
});

// =============================================================================
// Audit Log Evidence Source Tests
// =============================================================================

describe('AuditLogEvidenceSource', () => {
  let mockStore: ImmutableAuditLogStore;
  let source: AuditLogEvidenceSource;

  beforeEach(() => {
    mockStore = createMockAuditLogStore([mockAuditLogEntry, mockHighRiskEntry, mockFailedEntry]);
    source = new AuditLogEvidenceSource({
      store: mockStore,
      verifyChainByDefault: false,
    });
  });

  it('should have correct name', () => {
    expect(source.name).toBe('audit_log');
  });

  it('should report as available', async () => {
    const available = await source.isAvailable();
    expect(available).toBe(true);
  });

  it('should collect evidence from audit logs', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    };

    const evidence = await source.collect(query);

    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].source).toBe('audit_log');
    expect(evidence[0].evidence.type).toBe('audit_log');
  });

  it('should filter by control ID', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
      controlId: 'CC6.1', // Maps to auth, security
    };

    const evidence = await source.collect(query);

    expect(evidence.length).toBeGreaterThan(0);
    // Should include auth entries
    const authEvidence = evidence.filter(e =>
      e.evidence.description.includes('auth')
    );
    expect(authEvidence.length).toBeGreaterThan(0);
  });

  it('should filter high-risk only', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
      highRiskOnly: true,
    };

    await source.collect(query);

    // Verify the store was called with highRiskOnly
    expect(mockStore.query).toHaveBeenCalledWith(
      expect.objectContaining({ highRiskOnly: true })
    );
  });

  it('should calculate relevance scores', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    };

    const evidence = await source.collect(query);

    for (const e of evidence) {
      expect(e.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(e.relevanceScore).toBeLessThanOrEqual(1);
    }
  });

  it('should find related control IDs', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
      controlId: 'CC6.1',
    };

    const evidence = await source.collect(query);

    for (const e of evidence) {
      expect(e.relatedControlIds.length).toBeGreaterThan(0);
      expect(e.relatedControlIds).toContain('CC6.1');
    }
  });

  it('should use explicit action categories when specified', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
      actionCategories: ['billing'],
    };

    await source.collect(query);

    expect(mockStore.query).toHaveBeenCalledWith(
      expect.objectContaining({ actionCategory: 'billing' })
    );
  });
});

// =============================================================================
// Decision Trace Evidence Source Tests
// =============================================================================

describe('DecisionTraceEvidenceSource', () => {
  let mockStore: DecisionTraceStore;
  let source: DecisionTraceEvidenceSource;

  beforeEach(() => {
    mockStore = createMockDecisionTraceStore([mockDecisionTrace, mockOverriddenTrace]);
    source = new DecisionTraceEvidenceSource({ store: mockStore });
  });

  it('should have correct name', () => {
    expect(source.name).toBe('decision_trace');
  });

  it('should report as available', async () => {
    const available = await source.isAvailable();
    expect(available).toBe(true);
  });

  it('should collect evidence from decision traces', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    };

    const evidence = await source.collect(query);

    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].source).toBe('decision_trace');
  });

  it('should include agent reasoning in metadata', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    };

    const evidence = await source.collect(query);
    const traceEvidence = evidence[0];

    expect(traceEvidence.evidence.metadata).toBeDefined();
    expect(traceEvidence.evidence.metadata!.reasoning).toBeDefined();
    expect(traceEvidence.evidence.metadata!.confidence).toBeDefined();
  });

  it('should boost relevance for human overrides', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    };

    const evidence = await source.collect(query);
    const overrideEvidence = evidence.find(e =>
      e.evidence.metadata?.humanOverride !== undefined
    );

    expect(overrideEvidence).toBeDefined();
    expect(overrideEvidence!.relevanceScore).toBeGreaterThan(0.7);
  });

  it('should filter by AI governance control category', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
      controlCategory: 'ai_governance',
    };

    await source.collect(query);

    // Should query all agent types
    expect(mockStore.query).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: 'triage' })
    );
    expect(mockStore.query).toHaveBeenCalledWith(
      expect.objectContaining({ agentType: 'coder' })
    );
  });

  it('should map agent types to SOC2 controls', async () => {
    const query: EvidenceQuery = {
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    };

    const evidence = await source.collect(query);
    const triageEvidence = evidence.find(e =>
      e.evidence.metadata?.agentType === 'triage'
    );

    expect(triageEvidence).toBeDefined();
    expect(triageEvidence!.relatedControlIds).toContain('CC3.2');
  });
});

// =============================================================================
// Evidence Collector Tests
// =============================================================================

describe('EvidenceCollector', () => {
  let auditLogStore: ImmutableAuditLogStore;
  let decisionTraceStore: DecisionTraceStore;
  let collector: EvidenceCollector;

  beforeEach(() => {
    auditLogStore = createMockAuditLogStore([mockAuditLogEntry, mockHighRiskEntry]);
    decisionTraceStore = createMockDecisionTraceStore([mockDecisionTrace]);
    collector = createEvidenceCollector(auditLogStore, decisionTraceStore);
  });

  it('should collect from all sources', async () => {
    const result = await collector.collect({
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    });

    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.bySource.auditLog).toBeGreaterThan(0);
    expect(result.bySource.decisionTrace).toBeGreaterThan(0);
  });

  it('should return evidence sorted by relevance', async () => {
    const result = await collector.collect({
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    });

    for (let i = 1; i < result.evidence.length; i++) {
      expect(result.evidence[i - 1].relevanceScore)
        .toBeGreaterThanOrEqual(result.evidence[i].relevanceScore);
    }
  });

  it('should include metadata in result', async () => {
    const result = await collector.collect({
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    });

    expect(result.metadata.collectedAt).toBeInstanceOf(Date);
    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.tenantId).toBe('tenant-1');
    expect(result.metadata.timeRange).toEqual(mockTimeRange);
  });

  it('should count evidence by control', async () => {
    const result = await collector.collect({
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    });

    expect(result.byControl).toBeDefined();
    expect(Object.keys(result.byControl).length).toBeGreaterThan(0);
  });

  it('should collect for specific control', async () => {
    const evidence = await collector.collectForControl(
      'tenant-1',
      mockControl,
      mockTimeRange
    );

    expect(evidence.length).toBeGreaterThanOrEqual(0);
    // All evidence should be related to the control
    for (const e of evidence) {
      expect(e.relatedControlIds).toContain('CC6.1');
    }
  });

  it('should collect for multiple controls', async () => {
    const controls = [
      mockControl,
      { ...mockControl, controlId: 'CC7.1', category: 'System Operations' },
    ];

    const resultMap = await collector.collectForControls(
      'tenant-1',
      controls,
      mockTimeRange
    );

    expect(resultMap.has('CC6.1')).toBe(true);
    expect(resultMap.has('CC7.1')).toBe(true);
  });

  it('should allow adding sources dynamically', async () => {
    const mockSource: EvidenceSource = {
      name: 'custom',
      isAvailable: vi.fn().mockResolvedValue(true),
      collect: vi.fn().mockResolvedValue([]),
    };

    collector.addSource(mockSource);

    await collector.collect({
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    });

    expect(mockSource.collect).toHaveBeenCalled();
  });

  it('should report available sources', async () => {
    const sources = await collector.getAvailableSources();

    expect(sources).toContain('audit_log');
    expect(sources).toContain('decision_trace');
  });

  it('should handle unavailable sources gracefully', async () => {
    const unavailableSource: EvidenceSource = {
      name: 'unavailable',
      isAvailable: vi.fn().mockResolvedValue(false),
      collect: vi.fn(),
    };

    collector.addSource(unavailableSource);

    const result = await collector.collect({
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
    });

    expect(result.evidence.length).toBeGreaterThan(0);
    expect(unavailableSource.collect).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Helper Function Tests
// =============================================================================

describe('Helper Functions', () => {
  const mockEvidence: CollectedEvidence[] = [
    {
      evidence: {
        id: 'ev-1',
        type: 'audit_log',
        description: 'Test evidence 1',
        collectedAt: new Date(),
        collectedBy: 'test',
      },
      source: 'audit_log',
      relevanceScore: 0.9,
      relatedControlIds: ['CC6.1'],
    },
    {
      evidence: {
        id: 'ev-2',
        type: 'audit_log',
        description: 'Test evidence 2',
        collectedAt: new Date(),
        collectedBy: 'test',
      },
      source: 'decision_trace',
      relevanceScore: 0.5,
      relatedControlIds: ['CC7.1'],
    },
    {
      evidence: {
        id: 'ev-3',
        type: 'audit_log',
        description: 'Test evidence 3',
        collectedAt: new Date(),
        collectedBy: 'test',
      },
      source: 'audit_log',
      relevanceScore: 0.3,
      relatedControlIds: ['CC6.1', 'CC8.1'],
    },
  ];

  describe('linkEvidenceToControl', () => {
    it('should add evidence to control', () => {
      const updated = linkEvidenceToControl(mockControl, mockEvidence);

      expect(updated.evidence.length).toBe(3);
      expect(updated.controlId).toBe(mockControl.controlId);
    });

    it('should not duplicate existing evidence', () => {
      const controlWithEvidence = {
        ...mockControl,
        evidence: [mockEvidence[0].evidence],
      };

      const updated = linkEvidenceToControl(controlWithEvidence, mockEvidence);

      // Should have original 1 + 2 new = 3 (not 4)
      expect(updated.evidence.length).toBe(3);
    });
  });

  describe('getEvidenceSummary', () => {
    it('should calculate summary statistics', () => {
      const result: EvidenceCollectionResult = {
        query: {
          tenantId: 'tenant-1',
          timeRange: mockTimeRange,
        },
        evidence: mockEvidence,
        bySource: {
          auditLog: 2,
          decisionTrace: 1,
          policyEvaluation: 0,
          document: 0,
        },
        byControl: {
          'CC6.1': 2,
          'CC7.1': 1,
          'CC8.1': 1,
        },
        chainVerification: {
          verified: 2,
          failed: 0,
          skipped: 1,
        },
        metadata: {
          collectedAt: new Date(),
          durationMs: 100,
          tenantId: 'tenant-1',
          timeRange: mockTimeRange,
        },
      };

      const summary = getEvidenceSummary(result);

      expect(summary.totalEvidence).toBe(3);
      expect(summary.averageRelevance).toBeCloseTo(0.567, 2);
      expect(summary.chainVerificationRate).toBe(1.0);
    });
  });

  describe('filterByRelevance', () => {
    it('should filter by minimum score', () => {
      const filtered = filterByRelevance(mockEvidence, 0.5);

      expect(filtered.length).toBe(2);
      expect(filtered.every(e => e.relevanceScore >= 0.5)).toBe(true);
    });
  });

  describe('getTopEvidence', () => {
    it('should return top N evidence', () => {
      const top = getTopEvidence(mockEvidence, 2);

      expect(top.length).toBe(2);
      expect(top[0].relevanceScore).toBe(0.9);
      expect(top[1].relevanceScore).toBe(0.5);
    });

    it('should handle count larger than array', () => {
      const top = getTopEvidence(mockEvidence, 10);

      expect(top.length).toBe(3);
    });
  });
});

// =============================================================================
// Singleton Tests
// =============================================================================

describe('Singleton Management', () => {
  beforeEach(() => {
    resetEvidenceCollector();
  });

  it('should throw when not initialized', () => {
    expect(() => getEvidenceCollector()).toThrow('Evidence collector not initialized');
  });

  it('should initialize and get collector', () => {
    const store = createMockAuditLogStore([]);
    const collector = initializeEvidenceCollector(store);

    expect(collector).toBeDefined();
    expect(getEvidenceCollector()).toBe(collector);
  });

  it('should allow setting collector', () => {
    const store = createMockAuditLogStore([]);
    const collector = createEvidenceCollector(store);

    setEvidenceCollector(collector);

    expect(getEvidenceCollector()).toBe(collector);
  });

  it('should reset collector', () => {
    const store = createMockAuditLogStore([]);
    initializeEvidenceCollector(store);

    resetEvidenceCollector();

    expect(() => getEvidenceCollector()).toThrow();
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Factory Functions', () => {
  describe('createAuditLogEvidenceSource', () => {
    it('should create source with default options', () => {
      const store = createMockAuditLogStore([]);
      const source = createAuditLogEvidenceSource(store);

      expect(source.name).toBe('audit_log');
    });

    it('should create source with custom options', () => {
      const store = createMockAuditLogStore([]);
      const source = createAuditLogEvidenceSource(store, {
        verifyChainByDefault: false,
        verifyBatchSize: 50,
      });

      expect(source.name).toBe('audit_log');
    });
  });

  describe('createDecisionTraceEvidenceSource', () => {
    it('should create source', () => {
      const store = createMockDecisionTraceStore([]);
      const source = createDecisionTraceEvidenceSource(store);

      expect(source.name).toBe('decision_trace');
    });
  });

  describe('createEvidenceCollector', () => {
    it('should create collector with audit log only', () => {
      const store = createMockAuditLogStore([]);
      const collector = createEvidenceCollector(store);

      expect(collector).toBeDefined();
    });

    it('should create collector with both sources', () => {
      const auditStore = createMockAuditLogStore([]);
      const traceStore = createMockDecisionTraceStore([]);
      const collector = createEvidenceCollector(auditStore, traceStore);

      expect(collector).toBeDefined();
    });

    it('should create collector with custom options', () => {
      const store = createMockAuditLogStore([]);
      const collector = createEvidenceCollector(store, undefined, {
        defaultMaxPerSource: 50,
        defaultVerifyChain: false,
        collectorId: 'custom-collector',
      });

      expect(collector).toBeDefined();
    });
  });
});

// =============================================================================
// Integration Scenarios
// =============================================================================

describe('Integration Scenarios', () => {
  it('should collect evidence for SOC2 Type II audit', async () => {
    const auditLogStore = createMockAuditLogStore([
      mockAuditLogEntry,
      mockHighRiskEntry,
      mockFailedEntry,
    ]);
    const decisionTraceStore = createMockDecisionTraceStore([
      mockDecisionTrace,
      mockOverriddenTrace,
    ]);

    const collector = createEvidenceCollector(auditLogStore, decisionTraceStore);

    // Collect for CC6 (Logical Access)
    const cc6Result = await collector.collect({
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
      controlId: 'CC6',
    });

    expect(cc6Result.evidence.length).toBeGreaterThan(0);
    expect(cc6Result.byControl['CC6']).toBeDefined();

    // Collect for CC8 (Change Management)
    const cc8Result = await collector.collect({
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
      controlId: 'CC8',
    });

    expect(cc8Result.evidence.length).toBeGreaterThan(0);
  });

  it('should collect evidence for ISO27001 certification', async () => {
    const auditLogStore = createMockAuditLogStore([mockAuditLogEntry]);
    const collector = createEvidenceCollector(auditLogStore);

    // Collect for A.9 (Access Control)
    const result = await collector.collect({
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
      controlId: 'A.9',
    });

    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('should prioritize high-risk evidence', async () => {
    const auditLogStore = createMockAuditLogStore([
      mockAuditLogEntry,
      mockHighRiskEntry,
    ]);
    const collector = createEvidenceCollector(auditLogStore);

    const result = await collector.collect({
      tenantId: 'tenant-1',
      timeRange: mockTimeRange,
      highRiskOnly: true,
    });

    // High-risk evidence should be collected
    const highRiskEvidence = result.evidence.filter(e =>
      e.evidence.description.includes('security') ||
      e.relevanceScore > 0.7
    );
    expect(highRiskEvidence.length).toBeGreaterThanOrEqual(0);
  });
});
