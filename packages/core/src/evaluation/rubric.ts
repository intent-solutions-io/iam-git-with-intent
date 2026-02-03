/**
 * Rubric Definition and Parser
 *
 * EPIC 003: Evaluation Harness + Golden Tasks Framework
 *
 * Defines YAML-based rubric format for evaluating agentic workflow outputs.
 * Rubrics support:
 * - Weighted dimensions (completeness, accuracy, actionability, etc.)
 * - Criteria with pass/fail/partial scoring
 * - Deterministic evaluation where possible
 * - LLM-assisted evaluation for subjective criteria
 *
 * @module @gwi/core/evaluation/rubric
 */

import { z } from 'zod';
import * as yaml from 'yaml';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Single criterion within a dimension
 */
export const CriterionSchema = z.object({
  id: z.string().describe('Unique identifier for the criterion'),
  description: z.string().describe('Human-readable description of the criterion'),
  type: z.enum(['deterministic', 'llm-assisted', 'hybrid']).default('deterministic')
    .describe('How this criterion is evaluated'),
  weight: z.number().min(0).max(1).default(1).describe('Weight within the dimension'),
  validator: z.string().optional().describe('Validator function name for deterministic checks'),
  prompt: z.string().optional().describe('Prompt for LLM-assisted evaluation'),
});

/**
 * Dimension (group of criteria)
 */
export const DimensionSchema = z.object({
  name: z.string().describe('Dimension name (e.g., completeness, accuracy)'),
  weight: z.number().min(0).max(1).describe('Weight in overall score (0-1)'),
  criteria: z.array(CriterionSchema).min(1).describe('Criteria within this dimension'),
  description: z.string().optional().describe('Description of what this dimension measures'),
});

/**
 * Grade scale definition
 */
export const GradeScaleSchema = z.object({
  A: z.tuple([z.number(), z.number()]).default([90, 100]),
  B: z.tuple([z.number(), z.number()]).default([80, 89]),
  C: z.tuple([z.number(), z.number()]).default([70, 79]),
  D: z.tuple([z.number(), z.number()]).default([60, 69]),
  F: z.tuple([z.number(), z.number()]).default([0, 59]),
});

/**
 * Full rubric definition
 */
export const RubricSchema = z.object({
  name: z.string().describe('Rubric name (e.g., pr-review, conflict-resolution)'),
  version: z.string().describe('Rubric version (semver)'),
  description: z.string().optional().describe('Description of what this rubric evaluates'),
  workflow: z.string().optional().describe('Target workflow type'),
  dimensions: z.array(DimensionSchema).min(1).describe('Scoring dimensions'),
  gradeScale: GradeScaleSchema.optional().describe('Letter grade scale'),
  passingScore: z.number().min(0).max(100).default(70).describe('Minimum passing score'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
});

// ============================================================================
// Types (inferred from schemas)
// ============================================================================

export type Criterion = z.infer<typeof CriterionSchema>;
export type Dimension = z.infer<typeof DimensionSchema>;
export type GradeScale = z.infer<typeof GradeScaleSchema>;
export type Rubric = z.infer<typeof RubricSchema>;

// ============================================================================
// Evaluation Result Types
// ============================================================================

/**
 * Result of evaluating a single criterion
 */
export interface CriterionResult {
  criterionId: string;
  score: number; // 0-100
  passed: boolean;
  explanation: string;
  evidence?: string[];
  evaluationType: 'deterministic' | 'llm-assisted' | 'hybrid';
}

/**
 * Result of evaluating a dimension
 */
export interface DimensionResult {
  dimensionName: string;
  score: number; // 0-100
  weightedScore: number;
  weight: number;
  criteria: CriterionResult[];
  explanation: string;
}

/**
 * Full evaluation result
 */
export interface EvaluationResult {
  rubricName: string;
  rubricVersion: string;
  overallScore: number; // 0-100
  letterGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  passed: boolean;
  dimensions: DimensionResult[];
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  metadata: {
    evaluatedAt: string;
    inputHash: string;
    evaluationDurationMs: number;
  };
}

// ============================================================================
// Rubric Loader
// ============================================================================

/**
 * Load and validate a rubric from a YAML file
 */
export function loadRubric(filePath: string): Rubric {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Rubric file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const parsed = yaml.parse(content);

  const result = RubricSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid rubric format in ${filePath}:\n${errors}`);
  }

  // Validate that dimension weights sum to 1
  const totalWeight = result.data.dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (Math.abs(totalWeight - 1) > 0.01) {
    throw new Error(`Dimension weights must sum to 1.0, got ${totalWeight.toFixed(2)}`);
  }

  return result.data;
}

/**
 * Load a rubric from a string (for testing)
 */
export function parseRubric(yamlContent: string): Rubric {
  const parsed = yaml.parse(yamlContent);
  const result = RubricSchema.safeParse(parsed);

  if (!result.success) {
    const errors = result.error.errors.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid rubric format:\n${errors}`);
  }

  return result.data;
}

/**
 * Discover all rubrics in a directory
 */
export function discoverRubrics(directory: string): Map<string, Rubric> {
  const rubrics = new Map<string, Rubric>();
  const absoluteDir = path.resolve(directory);

  if (!fs.existsSync(absoluteDir)) {
    return rubrics;
  }

  const files = fs.readdirSync(absoluteDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));

  for (const file of files) {
    try {
      const rubric = loadRubric(path.join(absoluteDir, file));
      rubrics.set(rubric.name, rubric);
    } catch (error) {
      console.warn(`Warning: Failed to load rubric ${file}:`, error);
    }
  }

  return rubrics;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert numeric score to letter grade
 */
export function scoreToLetterGrade(
  score: number,
  scale: GradeScale = GradeScaleSchema.parse({})
): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= scale.A[0]) return 'A';
  if (score >= scale.B[0]) return 'B';
  if (score >= scale.C[0]) return 'C';
  if (score >= scale.D[0]) return 'D';
  return 'F';
}

/**
 * Calculate weighted score from dimension results
 */
export function calculateOverallScore(dimensions: DimensionResult[]): number {
  return dimensions.reduce((sum, d) => sum + d.weightedScore, 0);
}

/**
 * Generate a summary from evaluation results
 */
export function generateSummary(result: Omit<EvaluationResult, 'summary'>): string {
  const passStatus = result.passed ? 'PASSED' : 'FAILED';
  const dimensionSummary = result.dimensions
    .map((d) => `${d.dimensionName}: ${d.score.toFixed(0)}%`)
    .join(', ');

  return `[${passStatus}] ${result.rubricName} v${result.rubricVersion}: Grade ${result.letterGrade} (${result.overallScore.toFixed(1)}/100). ${dimensionSummary}`;
}

/**
 * Validate that a rubric is well-formed and internally consistent
 */
export function validateRubric(rubric: Rubric): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check dimension weights sum to 1
  const totalWeight = rubric.dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (Math.abs(totalWeight - 1) > 0.01) {
    errors.push(`Dimension weights sum to ${totalWeight.toFixed(2)}, should be 1.0`);
  }

  // Check each dimension has valid criteria weights
  for (const dimension of rubric.dimensions) {
    const criteriaWeightSum = dimension.criteria.reduce((sum, c) => sum + c.weight, 0);
    if (criteriaWeightSum === 0) {
      errors.push(`Dimension '${dimension.name}' has no weighted criteria`);
    }

    // Check LLM-assisted criteria have prompts
    for (const criterion of dimension.criteria) {
      if (criterion.type === 'llm-assisted' && !criterion.prompt) {
        errors.push(`Criterion '${criterion.id}' is LLM-assisted but has no prompt`);
      }
      if (criterion.type === 'deterministic' && !criterion.validator) {
        // Deterministic without validator is allowed - uses default pass/fail
      }
    }
  }

  // Check grade scale is ordered correctly
  if (rubric.gradeScale) {
    const { A, B, C, D, F } = rubric.gradeScale;
    if (A[0] <= B[1] || B[0] <= C[1] || C[0] <= D[1] || D[0] <= F[1]) {
      errors.push('Grade scale ranges overlap or are not in descending order');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
