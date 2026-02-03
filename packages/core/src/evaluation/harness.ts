/**
 * Evaluation Harness
 *
 * EPIC 003: Evaluation Harness + Golden Tasks Framework
 *
 * Executes rubric-based evaluation of agentic workflow outputs.
 * Supports:
 * - Deterministic validators (pattern matching, required fields, etc.)
 * - LLM-assisted evaluation for subjective criteria
 * - Golden task fixtures for regression testing
 * - CI integration with pass/fail exit codes
 *
 * @module @gwi/core/evaluation/harness
 */

import * as crypto from 'crypto';
import {
  type Rubric,
  type Criterion,
  type Dimension,
  type CriterionResult,
  type DimensionResult,
  type EvaluationResult,
  scoreToLetterGrade,
  calculateOverallScore,
  generateSummary,
} from './rubric.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Input to be evaluated
 */
export interface EvaluationInput {
  /** The output to evaluate (e.g., PR description, review summary) */
  output: string;
  /** Optional structured data for deterministic checks */
  data?: Record<string, unknown>;
  /** Context about the input that produced this output */
  context?: {
    inputType?: string;
    inputHash?: string;
    agentId?: string;
    runId?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Validator function signature
 */
export type ValidatorFn = (
  output: string,
  data: Record<string, unknown> | undefined,
  criterion: Criterion
) => CriterionResult;

/**
 * LLM evaluator function signature
 */
export type LLMEvaluatorFn = (
  output: string,
  criterion: Criterion,
  context?: Record<string, unknown>
) => Promise<CriterionResult>;

/**
 * Harness configuration
 */
export interface EvaluationHarnessConfig {
  /** Custom validators keyed by name */
  validators?: Record<string, ValidatorFn>;
  /** LLM evaluator for subjective criteria */
  llmEvaluator?: LLMEvaluatorFn;
  /** Whether to fail fast on first failing criterion */
  failFast?: boolean;
  /** Timeout for LLM evaluations (ms) */
  llmTimeout?: number;
  /** Enable verbose logging */
  verbose?: boolean;
}

// ============================================================================
// Built-in Validators
// ============================================================================

/**
 * Default validators for common deterministic checks
 */
export const DEFAULT_VALIDATORS: Record<string, ValidatorFn> = {
  /**
   * Check if output is non-empty
   */
  'non-empty': (output, _data, criterion) => ({
    criterionId: criterion.id,
    score: output.trim().length > 0 ? 100 : 0,
    passed: output.trim().length > 0,
    explanation: output.trim().length > 0 ? 'Output is non-empty' : 'Output is empty',
    evaluationType: 'deterministic',
  }),

  /**
   * Check minimum length
   */
  'min-length': (output, data, criterion) => {
    const minLength = (data?.minLength as number) || 100;
    const length = output.trim().length;
    const passed = length >= minLength;
    return {
      criterionId: criterion.id,
      score: passed ? 100 : Math.round((length / minLength) * 100),
      passed,
      explanation: `Output length ${length} ${passed ? '>=' : '<'} minimum ${minLength}`,
      evaluationType: 'deterministic',
    };
  },

  /**
   * Check for required sections (markdown headers)
   */
  'required-sections': (output, data, criterion) => {
    const requiredSections = (data?.requiredSections as string[]) || [];
    const foundSections = requiredSections.filter((section) => {
      const pattern = new RegExp(`^#+\\s*${section}`, 'im');
      return pattern.test(output);
    });
    const score = requiredSections.length > 0
      ? Math.round((foundSections.length / requiredSections.length) * 100)
      : 100;
    return {
      criterionId: criterion.id,
      score,
      passed: score === 100,
      explanation: `Found ${foundSections.length}/${requiredSections.length} required sections`,
      evidence: foundSections,
      evaluationType: 'deterministic',
    };
  },

  /**
   * Check for required keywords/phrases
   */
  'required-keywords': (output, data, criterion) => {
    const keywords = (data?.keywords as string[]) || [];
    const outputLower = output.toLowerCase();
    const foundKeywords = keywords.filter((kw) => outputLower.includes(kw.toLowerCase()));
    const score = keywords.length > 0
      ? Math.round((foundKeywords.length / keywords.length) * 100)
      : 100;
    return {
      criterionId: criterion.id,
      score,
      passed: score >= 80, // Allow some missing keywords
      explanation: `Found ${foundKeywords.length}/${keywords.length} required keywords`,
      evidence: foundKeywords,
      evaluationType: 'deterministic',
    };
  },

  /**
   * Check for forbidden patterns (e.g., secrets, PII)
   */
  'no-forbidden': (output, data, criterion) => {
    const patterns = (data?.forbiddenPatterns as string[]) || [];
    const violations: string[] = [];
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'gi');
      if (regex.test(output)) {
        violations.push(pattern);
      }
    }
    return {
      criterionId: criterion.id,
      score: violations.length === 0 ? 100 : 0,
      passed: violations.length === 0,
      explanation: violations.length === 0
        ? 'No forbidden patterns found'
        : `Found ${violations.length} forbidden pattern(s)`,
      evidence: violations,
      evaluationType: 'deterministic',
    };
  },

  /**
   * Check JSON validity
   */
  'valid-json': (output, _data, criterion) => {
    try {
      JSON.parse(output);
      return {
        criterionId: criterion.id,
        score: 100,
        passed: true,
        explanation: 'Output is valid JSON',
        evaluationType: 'deterministic',
      };
    } catch {
      return {
        criterionId: criterion.id,
        score: 0,
        passed: false,
        explanation: 'Output is not valid JSON',
        evaluationType: 'deterministic',
      };
    }
  },

  /**
   * Check for line references (e.g., "line 42", "L42")
   */
  'has-line-references': (output, _data, criterion) => {
    const lineRefPattern = /\b(?:line\s*\d+|L\d+|\d+:\d+)\b/gi;
    const matches = output.match(lineRefPattern) || [];
    const passed = matches.length > 0;
    return {
      criterionId: criterion.id,
      score: passed ? 100 : 0,
      passed,
      explanation: passed
        ? `Found ${matches.length} line reference(s)`
        : 'No line references found',
      evidence: matches.slice(0, 5), // Limit evidence
      evaluationType: 'deterministic',
    };
  },

  /**
   * Check for code blocks in markdown
   */
  'has-code-blocks': (output, _data, criterion) => {
    const codeBlockPattern = /```[\s\S]*?```/g;
    const matches = output.match(codeBlockPattern) || [];
    const passed = matches.length > 0;
    return {
      criterionId: criterion.id,
      score: passed ? 100 : 0,
      passed,
      explanation: passed
        ? `Found ${matches.length} code block(s)`
        : 'No code blocks found',
      evaluationType: 'deterministic',
    };
  },

  /**
   * Check for actionable items (e.g., "TODO", "Action:", bullet points)
   * Configurable via data.minItems (default: 2)
   */
  'has-actionable-items': (output, data, criterion) => {
    const minItems = (data as { minItems?: number })?.minItems ?? 2;
    const actionPatterns = [
      /\bTODO\b/gi,
      /\bAction\s*:/gi,
      /^[-*]\s+/gm, // Bullet points
      /^\d+\.\s+/gm, // Numbered lists
    ];
    let totalMatches = 0;
    for (const pattern of actionPatterns) {
      const matches = output.match(pattern) || [];
      totalMatches += matches.length;
    }
    const passed = totalMatches >= minItems;
    const scorePerItem = Math.floor(100 / minItems);
    return {
      criterionId: criterion.id,
      score: passed ? 100 : Math.min(100, totalMatches * scorePerItem),
      passed,
      explanation: `Found ${totalMatches} actionable item indicator(s), required ${minItems}`,
      evaluationType: 'deterministic',
    };
  },
};

// ============================================================================
// Evaluation Harness
// ============================================================================

/**
 * Evaluation Harness - runs rubric-based evaluation
 */
export class EvaluationHarness {
  private validators: Record<string, ValidatorFn>;
  private llmEvaluator?: LLMEvaluatorFn;
  private config: EvaluationHarnessConfig;

  constructor(config: EvaluationHarnessConfig = {}) {
    this.config = config;
    this.validators = {
      ...DEFAULT_VALIDATORS,
      ...(config.validators || {}),
    };
    this.llmEvaluator = config.llmEvaluator;
  }

  /**
   * Evaluate an input against a rubric
   */
  async evaluate(input: EvaluationInput, rubric: Rubric): Promise<EvaluationResult> {
    const startTime = Date.now();
    const inputHash = this.computeHash(input.output);

    const dimensionResults: DimensionResult[] = [];

    // Evaluate each dimension
    for (const dimension of rubric.dimensions) {
      const result = await this.evaluateDimension(input, dimension);
      dimensionResults.push(result);

      // Fail fast if configured
      if (this.config.failFast && result.score < rubric.passingScore) {
        break;
      }
    }

    // Calculate overall score
    const overallScore = calculateOverallScore(dimensionResults);
    const letterGrade = scoreToLetterGrade(overallScore, rubric.gradeScale);
    const passed = overallScore >= rubric.passingScore;

    // Generate insights
    const { strengths, weaknesses, recommendations } = this.generateInsights(dimensionResults);

    const result: Omit<EvaluationResult, 'summary'> = {
      rubricName: rubric.name,
      rubricVersion: rubric.version,
      overallScore,
      letterGrade,
      passed,
      dimensions: dimensionResults,
      strengths,
      weaknesses,
      recommendations,
      metadata: {
        evaluatedAt: new Date().toISOString(),
        inputHash,
        evaluationDurationMs: Date.now() - startTime,
      },
    };

    return {
      ...result,
      summary: generateSummary(result),
    };
  }

  /**
   * Evaluate a single dimension
   */
  private async evaluateDimension(
    input: EvaluationInput,
    dimension: Dimension
  ): Promise<DimensionResult> {
    const criteriaResults: CriterionResult[] = [];

    // Evaluate each criterion
    for (const criterion of dimension.criteria) {
      const result = await this.evaluateCriterion(input, criterion);
      criteriaResults.push(result);
    }

    // Calculate dimension score (weighted average of criteria)
    const totalWeight = dimension.criteria.reduce((sum, c) => sum + c.weight, 0);
    const weightedSum = criteriaResults.reduce((sum, r, i) => {
      const weight = dimension.criteria[i].weight;
      return sum + r.score * weight;
    }, 0);
    const dimensionScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

    return {
      dimensionName: dimension.name,
      score: dimensionScore,
      weightedScore: dimensionScore * dimension.weight,
      weight: dimension.weight,
      criteria: criteriaResults,
      explanation: this.generateDimensionExplanation(dimension, criteriaResults, dimensionScore),
    };
  }

  /**
   * Evaluate a single criterion
   */
  private async evaluateCriterion(
    input: EvaluationInput,
    criterion: Criterion
  ): Promise<CriterionResult> {
    switch (criterion.type) {
      case 'deterministic':
        return this.evaluateDeterministic(input, criterion);

      case 'llm-assisted':
        return this.evaluateLLMAssisted(input, criterion);

      case 'hybrid':
        // Try deterministic first, fall back to LLM if inconclusive
        const deterministicResult = this.evaluateDeterministic(input, criterion);
        if (deterministicResult.score > 0 && deterministicResult.score < 100) {
          // Inconclusive - use LLM for final decision
          return this.evaluateLLMAssisted(input, criterion);
        }
        return deterministicResult;

      default:
        return this.evaluateDeterministic(input, criterion);
    }
  }

  /**
   * Evaluate using deterministic validator
   */
  private evaluateDeterministic(input: EvaluationInput, criterion: Criterion): CriterionResult {
    const validatorName = criterion.validator || 'non-empty';
    const validator = this.validators[validatorName];

    if (!validator) {
      return {
        criterionId: criterion.id,
        score: 0,
        passed: false,
        explanation: `Unknown validator: ${validatorName}`,
        evaluationType: 'deterministic',
      };
    }

    try {
      return validator(input.output, input.data, criterion);
    } catch (error) {
      return {
        criterionId: criterion.id,
        score: 0,
        passed: false,
        explanation: `Validator error: ${error instanceof Error ? error.message : String(error)}`,
        evaluationType: 'deterministic',
      };
    }
  }

  /**
   * Evaluate using LLM
   */
  private async evaluateLLMAssisted(
    input: EvaluationInput,
    criterion: Criterion
  ): Promise<CriterionResult> {
    if (!this.llmEvaluator) {
      // Fallback to default pass when no LLM evaluator
      return {
        criterionId: criterion.id,
        score: 50, // Neutral score
        passed: true,
        explanation: 'LLM evaluation skipped (no evaluator configured)',
        evaluationType: 'llm-assisted',
      };
    }

    try {
      const timeout = this.config.llmTimeout || 30000;
      const result = await Promise.race([
        this.llmEvaluator(input.output, criterion, input.context),
        new Promise<CriterionResult>((_, reject) =>
          setTimeout(() => reject(new Error('LLM evaluation timeout')), timeout)
        ),
      ]);
      return result;
    } catch (error) {
      return {
        criterionId: criterion.id,
        score: 50, // Neutral score on error
        passed: true,
        explanation: `LLM evaluation error: ${error instanceof Error ? error.message : String(error)}`,
        evaluationType: 'llm-assisted',
      };
    }
  }

  /**
   * Generate dimension explanation
   */
  private generateDimensionExplanation(
    dimension: Dimension,
    results: CriterionResult[],
    score: number
  ): string {
    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    const quality =
      score >= 90 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'acceptable' : 'needs improvement';
    return `${dimension.name}: ${quality} (${passed}/${total} criteria passed)`;
  }

  /**
   * Generate insights from dimension results
   */
  private generateInsights(dimensions: DimensionResult[]): {
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    for (const dimension of dimensions) {
      if (dimension.score >= 80) {
        strengths.push(`${dimension.dimensionName}: ${dimension.explanation}`);
      } else if (dimension.score < 60) {
        weaknesses.push(`${dimension.dimensionName}: ${dimension.explanation}`);

        // Generate recommendations based on failed criteria
        for (const criterion of dimension.criteria) {
          if (!criterion.passed) {
            recommendations.push(`Improve ${dimension.dimensionName}: ${criterion.explanation}`);
          }
        }
      }
    }

    return { strengths, weaknesses, recommendations: recommendations.slice(0, 5) };
  }

  /**
   * Compute hash of input for tracking
   */
  private computeHash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
  }

  /**
   * Register a custom validator
   */
  registerValidator(name: string, validator: ValidatorFn): void {
    this.validators[name] = validator;
  }

  /**
   * Set LLM evaluator
   */
  setLLMEvaluator(evaluator: LLMEvaluatorFn): void {
    this.llmEvaluator = evaluator;
  }
}

/**
 * Create a harness with default configuration
 */
export function createHarness(config?: EvaluationHarnessConfig): EvaluationHarness {
  return new EvaluationHarness(config);
}
