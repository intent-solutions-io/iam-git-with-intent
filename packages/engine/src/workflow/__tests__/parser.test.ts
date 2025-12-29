/**
 * Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseYaml,
  parseJson,
  parseWorkflow,
  parseWorkflowFromFile,
  toYaml,
  toJson,
  looksLikeWorkflow,
  WorkflowParseError,
} from '../parser.js';
import type { WorkflowDefinition } from '../schema.js';
import { validateWorkflow, analyzeWorkflow } from '../index.js';

const TRIAGE_YAML = `
id: triage-workflow
version: 1.0.0
name: PR Triage
description: Analyze PR complexity

steps:
  - id: triage
    name: Analyze PR
    type: agent
    agent: triage-agent

  - id: approval
    name: Approve
    type: approval
    dependsOn:
      - triage

triggers:
  - type: webhook
    config:
      event: pull_request.opened
`;

const TRIAGE_JSON = `
{
  "id": "triage-workflow",
  "version": "1.0.0",
  "name": "PR Triage",
  "description": "Analyze PR complexity",
  "steps": [
    {
      "id": "triage",
      "name": "Analyze PR",
      "type": "agent",
      "agent": "triage-agent"
    },
    {
      "id": "approval",
      "name": "Approve",
      "type": "approval",
      "dependsOn": ["triage"]
    }
  ],
  "triggers": [
    {
      "type": "webhook",
      "config": {
        "event": "pull_request.opened"
      }
    }
  ]
}
`;

describe('parseYaml', () => {
  it('parses valid YAML workflow', () => {
    const workflow = parseYaml(TRIAGE_YAML);

    expect(workflow.id).toBe('triage-workflow');
    expect(workflow.version).toBe('1.0.0');
    expect(workflow.name).toBe('PR Triage');
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.triggers).toHaveLength(1);
  });

  it('validates workflow structure', () => {
    const workflow = parseYaml(TRIAGE_YAML);
    const validation = validateWorkflow(workflow);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('throws on invalid YAML', () => {
    const invalidYaml = `
      id: test
      steps: [
        invalid yaml structure
    `;

    expect(() => parseYaml(invalidYaml)).toThrow(WorkflowParseError);
  });

  it('throws on invalid workflow schema', () => {
    const invalidWorkflow = `
      id: test
      version: invalid-version
      name: Test
      steps: []
      triggers: []
    `;

    expect(() => parseYaml(invalidWorkflow)).toThrow(WorkflowParseError);
  });
});

describe('parseJson', () => {
  it('parses valid JSON workflow', () => {
    const workflow = parseJson(TRIAGE_JSON);

    expect(workflow.id).toBe('triage-workflow');
    expect(workflow.version).toBe('1.0.0');
    expect(workflow.name).toBe('PR Triage');
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.triggers).toHaveLength(1);
  });

  it('validates workflow structure', () => {
    const workflow = parseJson(TRIAGE_JSON);
    const validation = validateWorkflow(workflow);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('throws on invalid JSON', () => {
    const invalidJson = '{ id: test, invalid json }';

    expect(() => parseJson(invalidJson)).toThrow(WorkflowParseError);
  });

  it('throws on invalid workflow schema', () => {
    const invalidWorkflow = JSON.stringify({
      id: 'test',
      version: 'invalid',
      name: 'Test',
      steps: [],
      triggers: [],
    });

    expect(() => parseJson(invalidWorkflow)).toThrow(WorkflowParseError);
  });
});

describe('parseWorkflow', () => {
  it('auto-detects YAML format', () => {
    const workflow = parseWorkflow(TRIAGE_YAML);

    expect(workflow.id).toBe('triage-workflow');
    expect(workflow.steps).toHaveLength(2);
  });

  it('auto-detects JSON format', () => {
    const workflow = parseWorkflow(TRIAGE_JSON);

    expect(workflow.id).toBe('triage-workflow');
    expect(workflow.steps).toHaveLength(2);
  });

  it('uses explicit format parameter', () => {
    const workflow = parseWorkflow(TRIAGE_YAML, 'yaml');

    expect(workflow.id).toBe('triage-workflow');
  });

  it('parses JSON with explicit format', () => {
    const workflow = parseWorkflow(TRIAGE_JSON, 'json');

    expect(workflow.id).toBe('triage-workflow');
  });
});

describe('parseWorkflowFromFile', () => {
  it('detects YAML from .yaml extension', () => {
    const workflow = parseWorkflowFromFile(TRIAGE_YAML, 'workflow.yaml');

    expect(workflow.id).toBe('triage-workflow');
  });

  it('detects YAML from .yml extension', () => {
    const workflow = parseWorkflowFromFile(TRIAGE_YAML, 'workflow.yml');

    expect(workflow.id).toBe('triage-workflow');
  });

  it('detects JSON from .json extension', () => {
    const workflow = parseWorkflowFromFile(TRIAGE_JSON, 'workflow.json');

    expect(workflow.id).toBe('triage-workflow');
  });

  it('auto-detects format when extension is unknown', () => {
    const workflow = parseWorkflowFromFile(TRIAGE_YAML, 'workflow.txt');

    expect(workflow.id).toBe('triage-workflow');
  });
});

describe('toYaml', () => {
  it('serializes workflow to YAML', () => {
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

    const yaml = toYaml(workflow);

    expect(yaml).toContain('id: test');
    expect(yaml).toContain('version: 1.0.0');
    expect(yaml).toContain('name: Test');
  });

  it('round-trips correctly', () => {
    const original = parseYaml(TRIAGE_YAML);
    const yaml = toYaml(original);
    const parsed = parseYaml(yaml);

    expect(parsed).toEqual(original);
  });
});

describe('toJson', () => {
  it('serializes workflow to JSON', () => {
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

    const json = toJson(workflow);
    const parsed = JSON.parse(json);

    expect(parsed.id).toBe('test');
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.name).toBe('Test');
  });

  it('round-trips correctly', () => {
    const original = parseJson(TRIAGE_JSON);
    const json = toJson(original);
    const parsed = parseJson(json);

    expect(parsed).toEqual(original);
  });

  it('supports compact output', () => {
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

    const compact = toJson(workflow, false);

    expect(compact).not.toContain('\n');
    expect(compact.length).toBeLessThan(toJson(workflow, true).length);
  });
});

describe('looksLikeWorkflow', () => {
  it('returns true for valid workflow object', () => {
    const workflow = {
      id: 'test',
      version: '1.0.0',
      name: 'Test',
      steps: [],
      triggers: [],
    };

    expect(looksLikeWorkflow(workflow)).toBe(true);
  });

  it('returns false for invalid objects', () => {
    expect(looksLikeWorkflow({})).toBe(false);
    expect(looksLikeWorkflow({ id: 'test' })).toBe(false);
    expect(looksLikeWorkflow({ id: 'test', version: '1.0.0' })).toBe(false);
    expect(looksLikeWorkflow(null)).toBe(false);
    expect(looksLikeWorkflow('not an object')).toBe(false);
    expect(looksLikeWorkflow(123)).toBe(false);
  });

  it('returns true even if validation would fail', () => {
    // Has required fields but invalid values
    const workflow = {
      id: 'test',
      version: 'invalid',
      name: 'Test',
      steps: [],
      triggers: [],
    };

    expect(looksLikeWorkflow(workflow)).toBe(true);
  });
});

describe('Example Workflows', () => {
  it('validates triage.yaml example', () => {
    const examplePath = join(process.cwd(), 'examples/workflows/triage.yaml');
    let content: string;

    try {
      content = readFileSync(examplePath, 'utf-8');
    } catch {
      // Skip if examples don't exist (e.g., in CI)
      return;
    }

    const workflow = parseYaml(content);
    const validation = validateWorkflow(workflow);
    const analysis = analyzeWorkflow(workflow);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(analysis.isAcyclic).toBe(true);
    expect(analysis.topologicalOrder).toBeDefined();
  });

  it('validates resolve.yaml example', () => {
    const examplePath = join(process.cwd(), 'examples/workflows/resolve.yaml');
    let content: string;

    try {
      content = readFileSync(examplePath, 'utf-8');
    } catch {
      return;
    }

    const workflow = parseYaml(content);
    const validation = validateWorkflow(workflow);
    const analysis = analyzeWorkflow(workflow);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(analysis.isAcyclic).toBe(true);
    expect(analysis.topologicalOrder).toBeDefined();
  });

  it('validates autopilot.yaml example', () => {
    const examplePath = join(process.cwd(), 'examples/workflows/autopilot.yaml');
    let content: string;

    try {
      content = readFileSync(examplePath, 'utf-8');
    } catch {
      return;
    }

    const workflow = parseYaml(content);
    const validation = validateWorkflow(workflow);
    const analysis = analyzeWorkflow(workflow);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(analysis.isAcyclic).toBe(true);
    expect(analysis.topologicalOrder).toBeDefined();
  });
});
