/**
 * LLM Provider Evaluation Hooks
 *
 * EPIC 004: Connect provider outputs to EPIC 003's rubric evaluation system.
 * Enables quality gating on LLM responses before they're used.
 */

import { z } from 'zod';
import type { LLMProvider, LLMJsonCompletionResponse, LLMTextCompletionResponse } from './types.js';
import {
  type Rubric,
  type EvaluationResult,
  loadRubric,
  scoreToLetterGrade,
} from '../evaluation/rubric.js';
import { EvaluationHarness, type EvaluationInput } from '../evaluation/harness.js';

// =============================================================================
// Evaluation Hook Types
// =============================================================================

/**
 * Evaluation hook configuration
 */
export const EvaluationHookConfigSchema = z.object({
  /** Whether evaluation is enabled */
  enabled: z.boolean().default(true),
  /** Minimum score to pass (0-100) */
  minScore: z.number().min(0).max(100).default(70),
  /** Whether to fail hard on evaluation failure */
  failOnLowScore: z.boolean().default(false),
  /** Log evaluation results */
  logResults: z.boolean().default(true),
  /** Rubric path for loading */
  rubricPath: z.string().optional(),
  /** Custom validators to apply */
  validators: z.array(z.string()).optional(),
});

export type EvaluationHookConfig = z.infer<typeof EvaluationHookConfigSchema>;

/**
 * Evaluation hook result
 */
export interface EvaluationHookResult {
  /** Whether evaluation passed */
  passed: boolean;
  /** Overall score (0-100) */
  score: number;
  /** Letter grade */
  grade: string;
  /** Full evaluation result */
  evaluation?: EvaluationResult;
  /** Error if evaluation failed */
  error?: string;
  /** Recommendations for improvement */
  recommendations?: string[];
}

/**
 * Hook callback type
 */
export type EvaluationHook = (
  output: string,
  context: EvaluationContext
) => Promise<EvaluationHookResult>;

/**
 * Context provided to evaluation hooks
 */
export interface EvaluationContext {
  /** Provider that generated the output */
  provider: string;
  /** Model used */
  model: string;
  /** Request ID */
  requestId?: string;
  /** Original prompt/messages */
  prompt?: string;
  /** Task type hint */
  taskType?: string;
  /** Expected output schema */
  expectedSchema?: Record<string, unknown>;
  /** Custom context */
  custom?: Record<string, unknown>;
}

// =============================================================================
// Evaluation Hook Registry
// =============================================================================

/**
 * Registry of evaluation hooks
 */
class EvaluationHookRegistry {
  private hooks = new Map<string, EvaluationHook>();
  private config: EvaluationHookConfig = EvaluationHookConfigSchema.parse({});
  private harness: EvaluationHarness = new EvaluationHarness();
  private rubric?: Rubric;

  /**
   * Configure evaluation hooks
   */
  configure(config: Partial<EvaluationHookConfig>): void {
    this.config = EvaluationHookConfigSchema.parse({ ...this.config, ...config });
  }

  /**
   * Set the rubric for evaluation
   */
  setRubric(rubric: Rubric): void {
    this.rubric = rubric;
  }

  /**
   * Load rubric from file path
   */
  loadRubricFromPath(rubricPath: string): void {
    this.rubric = loadRubric(rubricPath);
  }

  /**
   * Register a named evaluation hook
   */
  register(name: string, hook: EvaluationHook): void {
    this.hooks.set(name, hook);
  }

  /**
   * Get a named hook
   */
  get(name: string): EvaluationHook | undefined {
    return this.hooks.get(name);
  }

  /**
   * Check if hooks are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the evaluation harness
   */
  getHarness(): EvaluationHarness {
    return this.harness;
  }

  /**
   * Evaluate output with configured hooks
   */
  async evaluate(output: string, context: EvaluationContext): Promise<EvaluationHookResult> {
    if (!this.config.enabled) {
      return { passed: true, score: 100, grade: 'A' };
    }

    // If no rubric, try to load from config path
    if (!this.rubric && this.config.rubricPath) {
      this.loadRubricFromPath(this.config.rubricPath);
    }

    // If still no rubric, return a basic pass
    if (!this.rubric) {
      return { passed: true, score: 100, grade: 'A', error: 'No rubric configured' };
    }

    try {
      // Build evaluation input
      const evalInput: EvaluationInput = {
        output,
        context: {
          inputType: context.taskType,
          metadata: {
            provider: context.provider,
            model: context.model,
            ...context.custom,
          },
        },
      };

      // Run evaluation
      const evaluation = await this.harness.evaluate(evalInput, this.rubric);

      const score = evaluation.overallScore;
      const grade = evaluation.letterGrade;
      const passed = score >= this.config.minScore;

      // Log if enabled
      if (this.config.logResults) {
        console.log(
          `[EvalHook] ${context.provider}/${context.model}: ${grade} (${score.toFixed(1)}%) - ${passed ? 'PASS' : 'FAIL'}`
        );
      }

      // Collect recommendations
      const recommendations: string[] = [];
      for (const dim of evaluation.dimensions) {
        if (dim.score < 70) {
          recommendations.push(`Improve ${dim.dimensionName}: scored ${dim.score.toFixed(0)}%`);
        }
      }

      const result: EvaluationHookResult = {
        passed,
        score,
        grade,
        evaluation,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
      };

      // Fail hard if configured
      if (this.config.failOnLowScore && !passed) {
        throw new Error(
          `Evaluation failed: ${grade} (${score.toFixed(1)}%) below minimum ${this.config.minScore}%`
        );
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.config.failOnLowScore) {
        throw error;
      }

      return {
        passed: false,
        score: 0,
        grade: 'F',
        error: errorMessage,
      };
    }
  }

  /**
   * Run all registered hooks
   */
  async runHooks(output: string, context: EvaluationContext): Promise<EvaluationHookResult[]> {
    const results: EvaluationHookResult[] = [];

    for (const [name, hook] of this.hooks) {
      try {
        const result = await hook(output, context);
        results.push(result);
      } catch (error) {
        results.push({
          passed: false,
          score: 0,
          grade: 'F',
          error: `Hook ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    return results;
  }
}

/**
 * Global evaluation hook registry
 */
export const evaluationHookRegistry = new EvaluationHookRegistry();

// =============================================================================
// Provider Wrapper with Evaluation
// =============================================================================

/**
 * Wrap a provider with evaluation hooks
 */
export function wrapProviderWithEvaluation(
  provider: LLMProvider,
  hookConfig?: Partial<EvaluationHookConfig>
): LLMProvider {
  if (hookConfig) {
    evaluationHookRegistry.configure(hookConfig);
  }

  return {
    type: provider.type,
    name: provider.name,
    isAvailable: () => provider.isAvailable(),
    getModel: () => provider.getModel(),

    async completeJson(request): Promise<LLMJsonCompletionResponse> {
      const response = await provider.completeJson(request);

      // Run evaluation on raw output
      const evalResult = await evaluationHookRegistry.evaluate(response.raw, {
        provider: provider.type,
        model: response.model,
        requestId: response.requestId,
        prompt: request.messages.map((m) => m.content).join('\n'),
        expectedSchema: request.schemaHint?.schema,
      });

      // Attach evaluation to response
      (response as LLMJsonCompletionResponseWithEval).evaluation = evalResult;

      return response;
    },

    async completeText(request): Promise<LLMTextCompletionResponse> {
      const response = await provider.completeText(request);

      // Run evaluation on text output
      const evalResult = await evaluationHookRegistry.evaluate(response.text, {
        provider: provider.type,
        model: response.model,
        requestId: response.requestId,
        prompt: request.messages.map((m) => m.content).join('\n'),
      });

      // Attach evaluation to response
      (response as LLMTextCompletionResponseWithEval).evaluation = evalResult;

      return response;
    },
  };
}

/**
 * Extended response types with evaluation
 */
export interface LLMJsonCompletionResponseWithEval extends LLMJsonCompletionResponse {
  evaluation?: EvaluationHookResult;
}

export interface LLMTextCompletionResponseWithEval extends LLMTextCompletionResponse {
  evaluation?: EvaluationHookResult;
}

// =============================================================================
// Built-in Evaluation Hooks
// =============================================================================

/**
 * JSON structure validation hook
 */
export const jsonStructureHook: EvaluationHook = async (output, _context) => {
  try {
    JSON.parse(output);
    return { passed: true, score: 100, grade: 'A' };
  } catch {
    return {
      passed: false,
      score: 0,
      grade: 'F',
      error: 'Output is not valid JSON',
      recommendations: ['Ensure the model returns valid JSON without markdown fences'],
    };
  }
};

/**
 * Code syntax validation hook (basic)
 */
export const codeSyntaxHook: EvaluationHook = async (output, _context) => {
  // Check for common syntax issues
  const issues: string[] = [];

  // Check for unbalanced braces/brackets
  const braces = { '{': 0, '}': 0, '[': 0, ']': 0, '(': 0, ')': 0 };
  for (const char of output) {
    if (char in braces) {
      braces[char as keyof typeof braces]++;
    }
  }

  if (braces['{'] !== braces['}']) {
    issues.push('Unbalanced curly braces');
  }
  if (braces['['] !== braces[']']) {
    issues.push('Unbalanced square brackets');
  }
  if (braces['('] !== braces[')']) {
    issues.push('Unbalanced parentheses');
  }

  // Check for unterminated strings (simple heuristic)
  const singleQuotes = (output.match(/'/g) || []).length;
  const doubleQuotes = (output.match(/"/g) || []).length;
  const backticks = (output.match(/`/g) || []).length;

  if (singleQuotes % 2 !== 0) {
    issues.push('Possible unterminated single-quoted string');
  }
  if (doubleQuotes % 2 !== 0) {
    issues.push('Possible unterminated double-quoted string');
  }
  if (backticks % 2 !== 0) {
    issues.push('Possible unterminated template literal');
  }

  const score = issues.length === 0 ? 100 : Math.max(0, 100 - issues.length * 20);

  return {
    passed: issues.length === 0,
    score,
    grade: scoreToLetterGrade(score),
    recommendations: issues.length > 0 ? issues : undefined,
  };
};

/**
 * Length validation hook
 */
export function createLengthHook(minLength: number, maxLength: number): EvaluationHook {
  return async (output, _context) => {
    const length = output.length;
    const issues: string[] = [];

    if (length < minLength) {
      issues.push(`Output too short: ${length} < ${minLength} characters`);
    }
    if (length > maxLength) {
      issues.push(`Output too long: ${length} > ${maxLength} characters`);
    }

    const passed = issues.length === 0;

    return {
      passed,
      score: passed ? 100 : 50,
      grade: passed ? 'A' : 'C',
      recommendations: issues.length > 0 ? issues : undefined,
    };
  };
}

// Register built-in hooks
evaluationHookRegistry.register('jsonStructure', jsonStructureHook);
evaluationHookRegistry.register('codeSyntax', codeSyntaxHook);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Configure evaluation hooks globally
 */
export function configureEvaluationHooks(config: Partial<EvaluationHookConfig>): void {
  evaluationHookRegistry.configure(config);
}

/**
 * Register a custom evaluation hook
 */
export function registerEvaluationHook(name: string, hook: EvaluationHook): void {
  evaluationHookRegistry.register(name, hook);
}

/**
 * Evaluate output directly (without wrapping a provider)
 */
export async function evaluateOutput(
  output: string,
  context: EvaluationContext
): Promise<EvaluationHookResult> {
  return evaluationHookRegistry.evaluate(output, context);
}
