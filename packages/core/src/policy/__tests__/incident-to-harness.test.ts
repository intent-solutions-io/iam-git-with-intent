/**
 * Tests for Incident-to-Harness Feedback Loop
 *
 * Code Factory Pattern 8: ViolationDetector → GoldenTask generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  IncidentHarnessGenerator,
  createHarnessGenerator,
  GoldenTaskSchema,
  type GoldenTask,
  type GenerationResult,
} from '../incident-to-harness.js';
import {
  createPolicyDeniedViolation,
  createApprovalBypassedViolation,
  createLimitExceededViolation,
  createAnomalyDetectedViolation,
  type Violation,
} from '../violation-schema.js';

// =============================================================================
// Test Helpers
// =============================================================================

function makeResolvedViolation(
  overrides: Partial<Violation> = {},
): Violation {
  const base = createPolicyDeniedViolation(
    'tenant-1',
    { type: 'agent', id: 'coder-agent' },
    { type: 'repository', id: 'repo-123' },
    { type: 'git_push', category: 'scm' },
    {
      policyId: 'policy-prod-branch',
      ruleId: 'rule-no-force-push',
      ruleDescription: 'Force push to protected branch denied',
      effect: 'deny',
    },
  );

  return {
    ...base,
    status: 'resolved',
    metadata: {
      ...base.metadata,
      updatedAt: new Date(),
      resolutionNotes: 'Fixed: added branch protection check before push',
    },
    ...overrides,
  } as Violation;
}

function makeApprovalBypassViolation(): Violation {
  const base = createApprovalBypassedViolation(
    'tenant-1',
    { type: 'user', id: 'user-42' },
    { type: 'pull_request', id: 'pr-99' },
    { type: 'merge', category: 'scm' },
    {
      workflowId: 'wf-merge-approval',
      workflowName: 'PR Merge Approval',
      bypassMethod: 'force',
      requiredApprovers: ['lead-1', 'lead-2'],
    },
  );

  return {
    ...base,
    status: 'resolved',
    metadata: {
      ...base.metadata,
      updatedAt: new Date(),
      resolutionNotes: 'Approval flow enforced via pre-merge hook',
    },
  } as Violation;
}

function makeLimitExceededViolation(): Violation {
  const base = createLimitExceededViolation(
    'tenant-1',
    { type: 'agent', id: 'coder-agent' },
    { type: 'api', id: 'llm-api' },
    { type: 'api_call', category: 'llm' },
    {
      limitType: 'rate',
      limitName: 'llm-calls-per-minute',
      limit: 60,
      actual: 120,
      unit: 'requests',
      window: { duration: 1, unit: 'minute' },
    },
  );

  return {
    ...base,
    status: 'resolved',
    metadata: {
      ...base.metadata,
      updatedAt: new Date(),
      resolutionNotes: 'Added request throttling to agent loop',
    },
  } as Violation;
}

function makeAnomalyViolation(): Violation {
  const base = createAnomalyDetectedViolation(
    'tenant-1',
    { type: 'agent', id: 'coder-agent' },
    { type: 'repository', id: 'repo-456' },
    { type: 'bulk_file_delete', category: 'scm' },
    {
      anomalyType: 'volumetric',
      confidence: 0.95,
      score: 88,
      baseline: { filesPerCommit: 5 },
      observed: { filesPerCommit: 150 },
      detectionModel: 'statistical-zscore',
    },
  );

  return {
    ...base,
    status: 'resolved',
    metadata: {
      ...base.metadata,
      updatedAt: new Date(),
      resolutionNotes: 'Added file-count guard to bulk operations',
    },
  } as Violation;
}

// =============================================================================
// Tests
// =============================================================================

describe('IncidentHarnessGenerator', () => {
  let generator: IncidentHarnessGenerator;

  beforeEach(() => {
    generator = createHarnessGenerator();
  });

  // ---------------------------------------------------------------------------
  // Basic generation
  // ---------------------------------------------------------------------------

  describe('generateFromViolation', () => {
    it('should generate a golden task from a resolved policy-denied violation', async () => {
      const violation = makeResolvedViolation();
      const result = await generator.generateFromViolation(violation);

      expect(result.generated).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.yaml).toBeDefined();
      expect(result.task!.workflow).toBe('policy-enforcement');
      expect(result.task!.source.violationId).toBe(violation.id);
      expect(result.task!.source.violationType).toBe('policy-denied');
      expect(result.task!.tags).toContain('incident-regression');
      expect(result.task!.tags).toContain('policy-denied');
    });

    it('should generate from a resolved approval-bypassed violation', async () => {
      const violation = makeApprovalBypassViolation();
      const result = await generator.generateFromViolation(violation);

      expect(result.generated).toBe(true);
      expect(result.task!.workflow).toBe('approval-gate');
      expect(result.task!.expectedOutput.minScore).toBe(80);
      expect(result.task!.expectedOutput.requiredKeywords).toContain('approval');
    });

    it('should generate from a resolved limit-exceeded violation', async () => {
      const violation = makeLimitExceededViolation();
      const result = await generator.generateFromViolation(violation);

      expect(result.generated).toBe(true);
      expect(result.task!.workflow).toBe('rate-limiter');
      expect(result.task!.expectedOutput.requiredKeywords).toContain('limit');
    });

    it('should generate from a resolved anomaly-detected violation', async () => {
      const violation = makeAnomalyViolation();
      const result = await generator.generateFromViolation(violation);

      expect(result.generated).toBe(true);
      expect(result.task!.workflow).toBe('anomaly-detection');
      expect(result.task!.expectedOutput.minScore).toBe(80);
    });
  });

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  describe('filtering', () => {
    it('should reject unresolved violations', async () => {
      const violation = makeResolvedViolation({ status: 'detected' });
      const result = await generator.generateFromViolation(violation);

      expect(result.generated).toBe(false);
      expect(result.reason).toContain('detected');
    });

    it('should accept dismissed violations', async () => {
      const violation = makeResolvedViolation({ status: 'dismissed' });
      const result = await generator.generateFromViolation(violation);

      expect(result.generated).toBe(true);
    });

    it('should reject low severity when minimum is medium', async () => {
      const violation = makeResolvedViolation({ severity: 'low' });
      const result = await generator.generateFromViolation(violation);

      expect(result.generated).toBe(false);
      expect(result.reason).toContain('low');
    });

    it('should accept low severity when minimum is configured as low', async () => {
      const gen = createHarnessGenerator({ minimumSeverity: 'low' });
      const violation = makeResolvedViolation({ severity: 'low' });
      const result = await gen.generateFromViolation(violation);

      expect(result.generated).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Deduplication
  // ---------------------------------------------------------------------------

  describe('deduplication', () => {
    it('should not generate twice for the same violation', async () => {
      const violation = makeResolvedViolation();

      const first = await generator.generateFromViolation(violation);
      const second = await generator.generateFromViolation(violation);

      expect(first.generated).toBe(true);
      expect(second.generated).toBe(false);
      expect(second.reason).toContain('already generated');
    });

    it('should generate for different violations', async () => {
      const v1 = makeResolvedViolation();
      const v2 = makeApprovalBypassViolation();

      const r1 = await generator.generateFromViolation(v1);
      const r2 = await generator.generateFromViolation(v2);

      expect(r1.generated).toBe(true);
      expect(r2.generated).toBe(true);
    });

    it('should allow regeneration after reset', async () => {
      const violation = makeResolvedViolation();

      await generator.generateFromViolation(violation);
      generator.resetDeduplication();
      const result = await generator.generateFromViolation(violation);

      expect(result.generated).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // SLA tracking
  // ---------------------------------------------------------------------------

  describe('SLA tracking', () => {
    it('should mark within SLA when under 48 hours', async () => {
      const violation = makeResolvedViolation();
      // updatedAt is just now, so latency is ~0
      const result = await generator.generateFromViolation(violation);

      expect(result.sla?.withinSla).toBe(true);
      expect(result.sla?.actualHours).toBeLessThan(1);
      expect(result.task!.sla.withinSla).toBe(true);
    });

    it('should mark outside SLA when over 48 hours', async () => {
      const violation = makeResolvedViolation();
      // Set updatedAt to 72 hours ago
      const threedsAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
      violation.metadata.updatedAt = threedsAgo;

      const result = await generator.generateFromViolation(violation);

      expect(result.sla?.withinSla).toBe(false);
      expect(result.sla?.actualHours).toBeGreaterThan(48);
    });

    it('should use custom SLA target', async () => {
      const gen = createHarnessGenerator({ slaTargetHours: 4 });
      const violation = makeResolvedViolation();
      // Set updatedAt to 6 hours ago
      violation.metadata.updatedAt = new Date(Date.now() - 6 * 60 * 60 * 1000);

      const result = await gen.generateFromViolation(violation);

      expect(result.sla?.targetHours).toBe(4);
      expect(result.sla?.withinSla).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // YAML output
  // ---------------------------------------------------------------------------

  describe('YAML output', () => {
    it('should produce valid YAML with required fields', async () => {
      const violation = makeResolvedViolation();
      const result = await generator.generateFromViolation(violation);

      expect(result.yaml).toContain('tasks:');
      expect(result.yaml).toContain(`id: ${result.task!.id}`);
      expect(result.yaml).toContain('workflow: policy-enforcement');
      expect(result.yaml).toContain('source:');
      expect(result.yaml).toContain('input:');
      expect(result.yaml).toContain('expectedOutput:');
      expect(result.yaml).toContain('sla:');
      expect(result.yaml).toContain('tags:');
    });

    it('should include SLA header comment', async () => {
      const violation = makeResolvedViolation();
      const result = await generator.generateFromViolation(violation);

      expect(result.yaml).toContain('# Auto-generated golden task');
      expect(result.yaml).toContain('# SLA:');
    });

    it('should include resolution notes when present', async () => {
      const violation = makeResolvedViolation();
      const result = await generator.generateFromViolation(violation);

      expect(result.yaml).toContain('resolutionNotes:');
    });
  });

  // ---------------------------------------------------------------------------
  // Schema validation
  // ---------------------------------------------------------------------------

  describe('schema validation', () => {
    it('should produce a task that validates against GoldenTaskSchema', async () => {
      const violation = makeResolvedViolation();
      const result = await generator.generateFromViolation(violation);

      const parsed = GoldenTaskSchema.safeParse(result.task);
      expect(parsed.success).toBe(true);
    });

    it('should produce valid schema for all violation types', async () => {
      const violations = [
        makeResolvedViolation(),
        makeApprovalBypassViolation(),
        makeLimitExceededViolation(),
        makeAnomalyViolation(),
      ];

      for (const v of violations) {
        const result = await generator.generateFromViolation(v);
        const parsed = GoldenTaskSchema.safeParse(result.task);
        expect(parsed.success).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Callback
  // ---------------------------------------------------------------------------

  describe('onTaskGenerated callback', () => {
    it('should invoke callback with task and yaml', async () => {
      const callback = vi.fn();
      const gen = createHarnessGenerator({ onTaskGenerated: callback });

      const violation = makeResolvedViolation();
      await gen.generateFromViolation(violation);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.stringContaining('incident-') }),
        expect.stringContaining('tasks:'),
      );
    });

    it('should not invoke callback when generation is skipped', async () => {
      const callback = vi.fn();
      const gen = createHarnessGenerator({ onTaskGenerated: callback });

      const violation = makeResolvedViolation({ status: 'detected' });
      await gen.generateFromViolation(violation);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Custom workflow mapping
  // ---------------------------------------------------------------------------

  describe('custom workflow mapping', () => {
    it('should use custom workflow mapping', async () => {
      const gen = createHarnessGenerator({
        workflowMapping: {
          'policy-denied': 'custom-policy-workflow',
        },
      });

      const violation = makeResolvedViolation();
      const result = await gen.generateFromViolation(violation);

      expect(result.task!.workflow).toBe('custom-policy-workflow');
    });
  });
});
