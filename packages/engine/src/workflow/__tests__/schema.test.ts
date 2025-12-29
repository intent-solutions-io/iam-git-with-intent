/**
 * Schema and Validation Tests
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowDefinition, StepDefinition, RetryConfig } from '../schema.js';
import {
  WorkflowDefinitionSchema,
  StepDefinitionSchema,
  RetryConfigSchema,
  validateWorkflow,
  isWorkflowDefinition,
  isStepDefinition,
  parseWorkflowDefinition,
} from '../validation.js';

describe('RetryConfigSchema', () => {
  it('validates valid retry config', () => {
    const config: RetryConfig = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      backoffMultiplier: 2,
      maxDelayMs: 10000,
      jitter: true,
    };

    const result = RetryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects invalid maxAttempts', () => {
    const config = {
      maxAttempts: 0,
      baseDelayMs: 1000,
    };

    const result = RetryConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects maxAttempts > 10', () => {
    const config = {
      maxAttempts: 11,
      baseDelayMs: 1000,
    };

    const result = RetryConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('accepts minimal config', () => {
    const config: RetryConfig = {
      maxAttempts: 1,
      baseDelayMs: 0,
    };

    const result = RetryConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});

describe('StepDefinitionSchema', () => {
  it('validates agent step', () => {
    const step: StepDefinition = {
      id: 'triage',
      name: 'Triage PR',
      type: 'agent',
      agent: 'triage-agent',
      timeout: 30000,
    };

    const result = StepDefinitionSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it('rejects agent step without agent property', () => {
    const step = {
      id: 'triage',
      name: 'Triage PR',
      type: 'agent',
      timeout: 30000,
    };

    const result = StepDefinitionSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it('validates conditional step', () => {
    const step: StepDefinition = {
      id: 'check',
      name: 'Check Condition',
      type: 'conditional',
      condition: 'score > 5',
    };

    const result = StepDefinitionSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it('rejects conditional step without condition', () => {
    const step = {
      id: 'check',
      name: 'Check Condition',
      type: 'conditional',
    };

    const result = StepDefinitionSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it('validates parallel group step', () => {
    const step: StepDefinition = {
      id: 'parallel',
      name: 'Parallel Group',
      type: 'parallel_group',
      parallelSteps: ['step1', 'step2', 'step3'],
    };

    const result = StepDefinitionSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it('rejects parallel group without parallelSteps', () => {
    const step = {
      id: 'parallel',
      name: 'Parallel Group',
      type: 'parallel_group',
    };

    const result = StepDefinitionSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it('rejects step depending on itself', () => {
    const step = {
      id: 'self-dep',
      name: 'Self Dependent',
      type: 'approval',
      dependsOn: ['self-dep'],
    };

    const result = StepDefinitionSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  it('validates step with dependencies', () => {
    const step: StepDefinition = {
      id: 'step2',
      name: 'Step 2',
      type: 'approval',
      dependsOn: ['step1'],
    };

    const result = StepDefinitionSchema.safeParse(step);
    expect(result.success).toBe(true);
  });

  it('rejects invalid step ID characters', () => {
    const step = {
      id: 'invalid step!',
      name: 'Invalid',
      type: 'approval',
    };

    const result = StepDefinitionSchema.safeParse(step);
    expect(result.success).toBe(false);
  });
});

describe('WorkflowDefinitionSchema', () => {
  it('validates complete workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'triage-workflow',
      version: '1.0.0',
      name: 'PR Triage Workflow',
      description: 'Analyzes PR complexity',
      steps: [
        {
          id: 'triage',
          name: 'Triage',
          type: 'agent',
          agent: 'triage-agent',
        },
        {
          id: 'approve',
          name: 'Approve',
          type: 'approval',
          dependsOn: ['triage'],
        },
      ],
      triggers: [
        {
          type: 'webhook',
          config: { event: 'pull_request.opened' },
        },
      ],
      defaults: {
        stepTimeout: 60000,
        onFailure: 'abort',
      },
      tags: ['triage', 'automation'],
    };

    const result = WorkflowDefinitionSchema.safeParse(workflow);
    expect(result.success).toBe(true);
  });

  it('rejects workflow with duplicate step IDs', () => {
    const workflow = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'approval',
        },
        {
          id: 'step1',
          name: 'Step 1 Duplicate',
          type: 'approval',
        },
      ],
      triggers: [
        {
          type: 'manual',
          config: {},
        },
      ],
    };

    const result = WorkflowDefinitionSchema.safeParse(workflow);
    expect(result.success).toBe(false);
  });

  it('rejects workflow with invalid dependsOn reference', () => {
    const workflow = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'approval',
          dependsOn: ['nonexistent'],
        },
      ],
      triggers: [
        {
          type: 'manual',
          config: {},
        },
      ],
    };

    const result = WorkflowDefinitionSchema.safeParse(workflow);
    expect(result.success).toBe(false);
  });

  it('rejects workflow with invalid parallelSteps reference', () => {
    const workflow = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        {
          id: 'parallel',
          name: 'Parallel',
          type: 'parallel_group',
          parallelSteps: ['nonexistent'],
        },
      ],
      triggers: [
        {
          type: 'manual',
          config: {},
        },
      ],
    };

    const result = WorkflowDefinitionSchema.safeParse(workflow);
    expect(result.success).toBe(false);
  });

  it('rejects invalid semver version', () => {
    const workflow = {
      id: 'test',
      version: 'v1.0',
      name: 'Test',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'approval',
        },
      ],
      triggers: [
        {
          type: 'manual',
          config: {},
        },
      ],
    };

    const result = WorkflowDefinitionSchema.safeParse(workflow);
    expect(result.success).toBe(false);
  });

  it('requires at least one step', () => {
    const workflow = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [],
      triggers: [
        {
          type: 'manual',
          config: {},
        },
      ],
    };

    const result = WorkflowDefinitionSchema.safeParse(workflow);
    expect(result.success).toBe(false);
  });

  it('requires at least one trigger', () => {
    const workflow = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'approval',
        },
      ],
      triggers: [],
    };

    const result = WorkflowDefinitionSchema.safeParse(workflow);
    expect(result.success).toBe(false);
  });
});

describe('validateWorkflow', () => {
  it('returns valid for correct workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'approval',
        },
      ],
      triggers: [
        {
          type: 'manual',
          config: {},
        },
      ],
    };

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects unreachable steps', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'approval',
        },
        {
          id: 'step2',
          name: 'Step 2',
          type: 'approval',
          dependsOn: ['step3'], // step3 doesn't exist in valid dependency
        },
        {
          id: 'step3',
          name: 'Step 3',
          type: 'approval',
          dependsOn: ['step2'], // circular dependency makes both unreachable
        },
      ],
      triggers: [
        {
          type: 'manual',
          config: {},
        },
      ],
    };

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(true); // Still schema-valid
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('not reachable'))).toBe(true);
  });

  it('warns about missing timeout configuration', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'approval',
          // No timeout specified
        },
      ],
      triggers: [
        {
          type: 'manual',
          config: {},
        },
      ],
      // No defaults either
    };

    const result = validateWorkflow(workflow);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('timeout'))).toBe(true);
  });

  it('returns errors for invalid workflow', () => {
    const invalidWorkflow = {
      id: 'test',
      version: 'invalid',
      name: 'Test',
      steps: [],
      triggers: [],
    };

    const result = validateWorkflow(invalidWorkflow);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('isWorkflowDefinition', () => {
  it('returns true for valid workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'approval',
        },
      ],
      triggers: [
        {
          type: 'manual',
          config: {},
        },
      ],
    };

    expect(isWorkflowDefinition(workflow)).toBe(true);
  });

  it('returns false for invalid workflow', () => {
    expect(isWorkflowDefinition({})).toBe(false);
    expect(isWorkflowDefinition(null)).toBe(false);
    expect(isWorkflowDefinition('not a workflow')).toBe(false);
  });
});

describe('isStepDefinition', () => {
  it('returns true for valid step', () => {
    const step: StepDefinition = {
      id: 'step1',
      name: 'Step 1',
      type: 'approval',
    };

    expect(isStepDefinition(step)).toBe(true);
  });

  it('returns false for invalid step', () => {
    expect(isStepDefinition({})).toBe(false);
    expect(isStepDefinition(null)).toBe(false);
  });
});

describe('parseWorkflowDefinition', () => {
  it('parses valid workflow', () => {
    const workflow: WorkflowDefinition = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [
        {
          id: 'step1',
          name: 'Step 1',
          type: 'approval',
        },
      ],
      triggers: [
        {
          type: 'manual',
          config: {},
        },
      ],
    };

    const parsed = parseWorkflowDefinition(workflow);
    expect(parsed).toEqual(workflow);
  });

  it('throws on invalid workflow', () => {
    const invalid = {
      id: 'test',
      version: 'invalid',
    };

    expect(() => parseWorkflowDefinition(invalid)).toThrow(/validation failed/i);
  });
});
