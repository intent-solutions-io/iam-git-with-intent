/**
 * Evaluation Module Tests
 * EPIC 003: Evaluation Harness + Golden Tasks Framework
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseRubric,
  validateRubric,
  scoreToLetterGrade,
  calculateOverallScore,
  generateSummary,
  type Rubric,
  type DimensionResult,
  type EvaluationResult,
} from '../rubric.js';
import {
  EvaluationHarness,
  createHarness,
  DEFAULT_VALIDATORS,
  type EvaluationInput,
} from '../harness.js';
import {
  GoldenTaskRunner,
  createGoldenRunner,
  createMockGenerator,
  GoldenTaskSchema,
} from '../golden-task.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const validRubricYaml = `
name: test-rubric
version: 1.0.0
description: Test rubric for unit tests
workflow: test

dimensions:
  - name: completeness
    weight: 0.5
    criteria:
      - id: non-empty
        description: Output is non-empty
        type: deterministic
        weight: 1
        validator: non-empty

      - id: min-length
        description: Output meets minimum length
        type: deterministic
        weight: 1
        validator: min-length

  - name: quality
    weight: 0.5
    criteria:
      - id: has-sections
        description: Has required sections
        type: deterministic
        weight: 1
        validator: required-sections

passingScore: 70
`;

const invalidRubricYaml = `
name: invalid-rubric
version: 1.0.0

dimensions:
  - name: overweight
    weight: 0.8
    criteria:
      - id: test
        description: Test criterion
        type: deterministic
        weight: 1
`;

// =============================================================================
// Rubric Tests
// =============================================================================

describe('Rubric Module', () => {
  describe('parseRubric', () => {
    it('parses valid YAML rubric', () => {
      const rubric = parseRubric(validRubricYaml);

      expect(rubric.name).toBe('test-rubric');
      expect(rubric.version).toBe('1.0.0');
      expect(rubric.dimensions).toHaveLength(2);
      expect(rubric.passingScore).toBe(70);
    });

    it('throws on invalid YAML', () => {
      expect(() => parseRubric('invalid: yaml: content:')).toThrow();
    });

    it('applies default values', () => {
      const minimalYaml = `
name: minimal
version: 0.1.0
dimensions:
  - name: basic
    weight: 1.0
    criteria:
      - id: c1
        description: Criterion 1
`;
      const rubric = parseRubric(minimalYaml);

      expect(rubric.passingScore).toBe(70); // default
      expect(rubric.dimensions[0].criteria[0].type).toBe('deterministic'); // default
      expect(rubric.dimensions[0].criteria[0].weight).toBe(1); // default
    });
  });

  describe('validateRubric', () => {
    it('validates correct rubric', () => {
      const rubric = parseRubric(validRubricYaml);
      const result = validateRubric(rubric);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects weight sum mismatch', () => {
      const rubric = parseRubric(invalidRubricYaml);
      const result = validateRubric(rubric);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sum'))).toBe(true);
    });

    it('detects missing LLM prompt', () => {
      const yamlWithLLM = `
name: llm-rubric
version: 1.0.0
dimensions:
  - name: quality
    weight: 1.0
    criteria:
      - id: subjective
        description: Subjective quality check
        type: llm-assisted
        weight: 1
`;
      const rubric = parseRubric(yamlWithLLM);
      const result = validateRubric(rubric);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('prompt'))).toBe(true);
    });
  });

  describe('scoreToLetterGrade', () => {
    it('converts scores to correct grades', () => {
      expect(scoreToLetterGrade(95)).toBe('A');
      expect(scoreToLetterGrade(90)).toBe('A');
      expect(scoreToLetterGrade(85)).toBe('B');
      expect(scoreToLetterGrade(75)).toBe('C');
      expect(scoreToLetterGrade(65)).toBe('D');
      expect(scoreToLetterGrade(55)).toBe('F');
      expect(scoreToLetterGrade(0)).toBe('F');
    });

    it('uses custom grade scale', () => {
      const customScale = {
        A: [95, 100] as [number, number],
        B: [85, 94] as [number, number],
        C: [75, 84] as [number, number],
        D: [65, 74] as [number, number],
        F: [0, 64] as [number, number],
      };

      expect(scoreToLetterGrade(93, customScale)).toBe('B');
      expect(scoreToLetterGrade(95, customScale)).toBe('A');
    });
  });

  describe('calculateOverallScore', () => {
    it('calculates weighted average', () => {
      const dimensions: DimensionResult[] = [
        {
          dimensionName: 'dim1',
          score: 80,
          weightedScore: 40, // 80 * 0.5
          weight: 0.5,
          criteria: [],
          explanation: '',
        },
        {
          dimensionName: 'dim2',
          score: 60,
          weightedScore: 30, // 60 * 0.5
          weight: 0.5,
          criteria: [],
          explanation: '',
        },
      ];

      expect(calculateOverallScore(dimensions)).toBe(70);
    });

    it('handles empty dimensions', () => {
      expect(calculateOverallScore([])).toBe(0);
    });
  });

  describe('generateSummary', () => {
    it('generates pass summary', () => {
      const result: Omit<EvaluationResult, 'summary'> = {
        rubricName: 'test',
        rubricVersion: '1.0.0',
        overallScore: 85,
        letterGrade: 'B',
        passed: true,
        dimensions: [],
        strengths: [],
        weaknesses: [],
        recommendations: [],
        metadata: {
          evaluatedAt: '2026-02-02',
          inputHash: 'abc123',
          evaluationDurationMs: 100,
        },
      };

      const summary = generateSummary(result);

      expect(summary).toContain('PASSED');
      expect(summary).toContain('test');
      expect(summary).toContain('B');
      expect(summary).toContain('85');
    });

    it('generates fail summary', () => {
      const result: Omit<EvaluationResult, 'summary'> = {
        rubricName: 'test',
        rubricVersion: '1.0.0',
        overallScore: 55,
        letterGrade: 'F',
        passed: false,
        dimensions: [],
        strengths: [],
        weaknesses: [],
        recommendations: [],
        metadata: {
          evaluatedAt: '2026-02-02',
          inputHash: 'abc123',
          evaluationDurationMs: 100,
        },
      };

      const summary = generateSummary(result);

      expect(summary).toContain('FAILED');
    });
  });
});

// =============================================================================
// Harness Tests
// =============================================================================

describe('Evaluation Harness', () => {
  let harness: EvaluationHarness;
  let rubric: Rubric;

  beforeEach(() => {
    harness = createHarness();
    rubric = parseRubric(validRubricYaml);
  });

  describe('DEFAULT_VALIDATORS', () => {
    it('non-empty validator passes for non-empty string', () => {
      const result = DEFAULT_VALIDATORS['non-empty'](
        'Hello World',
        undefined,
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('non-empty validator fails for empty string', () => {
      const result = DEFAULT_VALIDATORS['non-empty'](
        '   ',
        undefined,
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('min-length validator checks length', () => {
      const result = DEFAULT_VALIDATORS['min-length'](
        'Short',
        { minLength: 100 },
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );

      expect(result.passed).toBe(false);
      expect(result.score).toBeLessThan(100);
    });

    it('required-sections validator finds headers', () => {
      const output = '# Summary\nContent here\n## Details\nMore content';
      const result = DEFAULT_VALIDATORS['required-sections'](
        output,
        { requiredSections: ['Summary', 'Details'] },
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );

      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('required-keywords validator finds keywords', () => {
      const output = 'The quick brown fox jumps over the lazy dog';
      const result = DEFAULT_VALIDATORS['required-keywords'](
        output,
        { keywords: ['fox', 'dog'] },
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );

      expect(result.passed).toBe(true);
    });

    it('no-forbidden validator detects patterns', () => {
      const output = 'API_KEY=secret123';
      const result = DEFAULT_VALIDATORS['no-forbidden'](
        output,
        { forbiddenPatterns: ['API_KEY=\\w+'] },
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );

      expect(result.passed).toBe(false);
    });

    it('valid-json validator validates JSON', () => {
      const validResult = DEFAULT_VALIDATORS['valid-json'](
        '{"key": "value"}',
        undefined,
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );
      expect(validResult.passed).toBe(true);

      const invalidResult = DEFAULT_VALIDATORS['valid-json'](
        'not json',
        undefined,
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );
      expect(invalidResult.passed).toBe(false);
    });

    it('has-line-references validator finds references', () => {
      const result = DEFAULT_VALIDATORS['has-line-references'](
        'See line 42 and L100 for details',
        undefined,
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );

      expect(result.passed).toBe(true);
    });

    it('has-code-blocks validator finds code blocks', () => {
      const output = 'Here is code:\n```typescript\nconst x = 1;\n```';
      const result = DEFAULT_VALIDATORS['has-code-blocks'](
        output,
        undefined,
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );

      expect(result.passed).toBe(true);
    });

    it('has-actionable-items validator finds items', () => {
      const output = '- Item 1\n- Item 2\n1. First step';
      const result = DEFAULT_VALIDATORS['has-actionable-items'](
        output,
        undefined,
        { id: 'test', description: 'test', type: 'deterministic', weight: 1 }
      );

      expect(result.passed).toBe(true);
    });
  });

  describe('evaluate', () => {
    it('evaluates input against rubric', async () => {
      const input: EvaluationInput = {
        output: '# Summary\n\nThis is a comprehensive review with sufficient content to pass the minimum length requirement.',
        data: {
          minLength: 50,
          requiredSections: ['Summary'],
        },
      };

      const result = await harness.evaluate(input, rubric);

      expect(result.rubricName).toBe('test-rubric');
      expect(result.dimensions).toHaveLength(2);
      expect(result.metadata.inputHash).toBeDefined();
    });

    it('generates insights for low scores', async () => {
      const input: EvaluationInput = {
        output: '',
        data: {},
      };

      const result = await harness.evaluate(input, rubric);

      expect(result.passed).toBe(false);
      expect(result.weaknesses.length).toBeGreaterThan(0);
    });
  });

  describe('registerValidator', () => {
    it('allows custom validator registration', async () => {
      harness.registerValidator('custom-check', (output, _data, criterion) => ({
        criterionId: criterion.id,
        score: output.includes('PASS') ? 100 : 0,
        passed: output.includes('PASS'),
        explanation: output.includes('PASS') ? 'Found PASS' : 'Missing PASS',
        evaluationType: 'deterministic',
      }));

      const customRubric = parseRubric(`
name: custom
version: 1.0.0
dimensions:
  - name: custom-dim
    weight: 1.0
    criteria:
      - id: custom-check
        description: Custom check
        type: deterministic
        weight: 1
        validator: custom-check
`);

      const result = await harness.evaluate({ output: 'PASS' }, customRubric);
      expect(result.passed).toBe(true);
    });
  });
});

// =============================================================================
// Golden Task Tests
// =============================================================================

describe('Golden Task Module', () => {
  describe('GoldenTaskSchema', () => {
    it('validates correct golden task', () => {
      const task = {
        id: 'test-task',
        name: 'Test Task',
        workflow: 'pr-review',
        rubric: 'pr-review.yaml',
        input: {
          type: 'pr-diff',
          content: 'diff content',
        },
        expectedOutput: {
          minScore: 70,
        },
      };

      const result = GoldenTaskSchema.safeParse(task);
      expect(result.success).toBe(true);
    });

    it('rejects task with missing required fields', () => {
      const task = {
        id: 'test-task',
        // missing name, workflow, rubric, input
      };

      const result = GoldenTaskSchema.safeParse(task);
      expect(result.success).toBe(false);
    });

    it('applies default minScore', () => {
      const task = {
        id: 'test-task',
        name: 'Test Task',
        workflow: 'pr-review',
        rubric: 'pr-review.yaml',
        input: {
          type: 'pr-diff',
          content: 'diff content',
        },
        expectedOutput: {},
      };

      const result = GoldenTaskSchema.safeParse(task);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expectedOutput.minScore).toBe(70);
      }
    });
  });

  describe('createMockGenerator', () => {
    it('returns configured output for workflow:type', async () => {
      const generator = createMockGenerator({
        'pr-review:pr-diff': '# Mock PR Review\n\nThis is a mock review.',
      });

      const output = await generator(
        { type: 'pr-diff', content: 'some diff' },
        'pr-review'
      );

      expect(output).toContain('Mock PR Review');
    });

    it('returns default output for unconfigured workflow', async () => {
      const generator = createMockGenerator({});

      const output = await generator(
        { type: 'unknown', content: 'content' },
        'unknown-workflow'
      );

      expect(output).toContain('unknown-workflow');
      expect(output).toContain('mock');
    });
  });
});
