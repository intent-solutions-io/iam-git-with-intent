/**
 * Step Contract Validation Layer
 *
 * A3.s5: Validates step inputs and outputs, rejecting malformed data.
 * Provides detailed error messages for debugging.
 *
 * @module @gwi/engine/step-contract
 */

import { ZodError, z } from 'zod';
import {
  StepInput,
  StepOutput,
  type StepInput as StepInputType,
  type StepOutput as StepOutputType,
} from './types.js';

// =============================================================================
// Validation Error Types
// =============================================================================

/**
 * Validation error with detailed path information
 */
export interface ValidationError {
  /** Path to the invalid field */
  path: string[];

  /** Error message */
  message: string;

  /** Expected type/format */
  expected?: string;

  /** Received value (truncated for large values) */
  received?: string;
}

/**
 * Result of validation
 */
export interface ValidationResult<T> {
  /** Whether validation passed */
  valid: boolean;

  /** Validated data (only if valid) */
  data?: T;

  /** Validation errors (only if invalid) */
  errors?: ValidationError[];
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Truncate a value for error messages
 */
function truncateValue(value: unknown, maxLength = 100): string {
  const str = JSON.stringify(value);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Convert Zod errors to our ValidationError format
 */
function zodErrorsToValidationErrors(error: ZodError): ValidationError[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
    expected: 'expected' in issue ? String(issue.expected) : undefined,
    received: 'received' in issue ? truncateValue(issue.received) : undefined,
  }));
}

/**
 * Validate step input
 *
 * @param input - The step input to validate
 * @returns Validation result with typed data or errors
 */
export function validateStepInput(input: unknown): ValidationResult<StepInputType> {
  try {
    const data = StepInput.parse(input);
    return { valid: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        valid: false,
        errors: zodErrorsToValidationErrors(error),
      };
    }
    return {
      valid: false,
      errors: [{ path: [], message: String(error) }],
    };
  }
}

/**
 * Validate step output
 *
 * @param output - The step output to validate
 * @returns Validation result with typed data or errors
 */
export function validateStepOutput(output: unknown): ValidationResult<StepOutputType> {
  try {
    const data = StepOutput.parse(output);
    return { valid: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        valid: false,
        errors: zodErrorsToValidationErrors(error),
      };
    }
    return {
      valid: false,
      errors: [{ path: [], message: String(error) }],
    };
  }
}

/**
 * Validation error thrown when input/output is malformed
 */
export class StepValidationError extends Error {
  constructor(
    public readonly direction: 'input' | 'output',
    public readonly errors: ValidationError[],
    public readonly stepId?: string
  ) {
    const errorSummary = errors
      .slice(0, 3)
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');

    const moreErrors = errors.length > 3 ? ` (+${errors.length - 3} more)` : '';

    super(
      `Invalid step ${direction}${stepId ? ` for step ${stepId}` : ''}: ${errorSummary}${moreErrors}`
    );

    this.name = 'StepValidationError';
  }
}

/**
 * Validate step input and throw if invalid
 *
 * @param input - The step input to validate
 * @throws StepValidationError if validation fails
 */
export function assertValidStepInput(input: unknown): StepInputType {
  const result = validateStepInput(input);
  if (!result.valid) {
    throw new StepValidationError('input', result.errors!);
  }
  return result.data!;
}

/**
 * Validate step output and throw if invalid
 *
 * @param output - The step output to validate
 * @param stepId - Optional step ID for error messages
 * @throws StepValidationError if validation fails
 */
export function assertValidStepOutput(output: unknown, stepId?: string): StepOutputType {
  const result = validateStepOutput(output);
  if (!result.valid) {
    throw new StepValidationError('output', result.errors!, stepId);
  }
  return result.data!;
}

// =============================================================================
// Partial Validation (for incremental building)
// =============================================================================

/**
 * Partial step input schema for incremental validation
 */
export const PartialStepInput = StepInput.partial();
export type PartialStepInput = z.infer<typeof PartialStepInput>;

/**
 * Partial step output schema for incremental validation
 */
export const PartialStepOutput = StepOutput.partial();
export type PartialStepOutput = z.infer<typeof PartialStepOutput>;

/**
 * Validate partial step input (for builders)
 */
export function validatePartialInput(input: unknown): ValidationResult<PartialStepInput> {
  try {
    const data = PartialStepInput.parse(input);
    return { valid: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return { valid: false, errors: zodErrorsToValidationErrors(error) };
    }
    return { valid: false, errors: [{ path: [], message: String(error) }] };
  }
}

/**
 * Validate partial step output (for builders)
 */
export function validatePartialOutput(output: unknown): ValidationResult<PartialStepOutput> {
  try {
    const data = PartialStepOutput.parse(output);
    return { valid: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return { valid: false, errors: zodErrorsToValidationErrors(error) };
    }
    return { valid: false, errors: [{ path: [], message: String(error) }] };
  }
}

// =============================================================================
// Semantic Validation (beyond schema)
// =============================================================================

/**
 * Semantic validation errors
 */
export interface SemanticValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Perform semantic validation on step output
 *
 * Checks for logical consistency beyond schema validation:
 * - timing.completedAt must be after timing.startedAt
 * - fatal result code must have error object
 * - requiresApproval must have proposedChanges
 * - etc.
 */
export function validateOutputSemantics(output: StepOutputType): SemanticValidationError[] {
  const errors: SemanticValidationError[] = [];

  // Check timing consistency
  if (output.timing.completedAt && output.timing.startedAt) {
    const start = new Date(output.timing.startedAt).getTime();
    const end = new Date(output.timing.completedAt).getTime();
    if (end < start) {
      errors.push({
        code: 'TIMING_INCONSISTENT',
        message: 'completedAt is before startedAt',
        severity: 'error',
      });
    }
  }

  // Check result code consistency
  if ((output.resultCode === 'fatal' || output.resultCode === 'retryable') && !output.error) {
    errors.push({
      code: 'MISSING_ERROR',
      message: `Result code '${output.resultCode}' requires error object`,
      severity: 'error',
    });
  }

  // Check approval consistency
  if (output.requiresApproval && (!output.proposedChanges || output.proposedChanges.length === 0)) {
    errors.push({
      code: 'MISSING_PROPOSED_CHANGES',
      message: 'requiresApproval is true but no proposedChanges provided',
      severity: 'warning',
    });
  }

  // Check duration consistency
  if (output.timing.durationMs !== undefined && output.timing.completedAt && output.timing.startedAt) {
    const start = new Date(output.timing.startedAt).getTime();
    const end = new Date(output.timing.completedAt).getTime();
    const expectedDuration = end - start;
    const tolerance = 100; // 100ms tolerance

    if (Math.abs(output.timing.durationMs - expectedDuration) > tolerance) {
      errors.push({
        code: 'DURATION_MISMATCH',
        message: `durationMs (${output.timing.durationMs}) doesn't match timestamp difference (${expectedDuration})`,
        severity: 'warning',
      });
    }
  }

  // Check cost consistency
  if (output.cost) {
    if (output.cost.tokens.total !== output.cost.tokens.input + output.cost.tokens.output) {
      errors.push({
        code: 'TOKEN_COUNT_MISMATCH',
        message: 'tokens.total should equal tokens.input + tokens.output',
        severity: 'error',
      });
    }
  }

  return errors;
}

/**
 * Perform full validation (schema + semantic)
 */
export function validateStepOutputFull(output: unknown): {
  schemaResult: ValidationResult<StepOutputType>;
  semanticErrors: SemanticValidationError[];
} {
  const schemaResult = validateStepOutput(output);

  if (!schemaResult.valid) {
    return { schemaResult, semanticErrors: [] };
  }

  const semanticErrors = validateOutputSemantics(schemaResult.data!);
  return { schemaResult, semanticErrors };
}
