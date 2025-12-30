/**
 * Workflow Parser
 *
 * C1: Parses workflow definitions from YAML/JSON strings and files.
 * Provides both sync and async parsing with proper error handling.
 *
 * @module @gwi/engine/workflow/parser
 */

import { WorkflowDefinition } from './schema.js';
import { validateWorkflow, WorkflowValidationResult } from './validation.js';

// =============================================================================
// Parser Error Types
// =============================================================================

/**
 * Error thrown when parsing fails
 */
export class WorkflowParseError extends Error {
  readonly name = 'WorkflowParseError';
  readonly isParseError = true;

  constructor(
    message: string,
    public readonly source?: string,
    public readonly cause?: Error
  ) {
    super(message);
  }
}

/**
 * Parse result with workflow and validation
 */
export interface ParseResult {
  /** The parsed workflow definition */
  workflow: WorkflowDefinition;
  /** Validation result */
  validation: WorkflowValidationResult;
  /** Source format detected */
  format: 'json' | 'yaml';
}

// =============================================================================
// YAML Support Detection
// =============================================================================

// YAML library is optional - workflows can be defined in JSON
let yamlParse: ((input: string) => unknown) | null = null;
let yamlSupported = false;

/**
 * Check if YAML parsing is supported
 */
export function isYamlSupported(): boolean {
  return yamlSupported;
}

/**
 * Initialize YAML support (call this at app startup if YAML is needed)
 *
 * @param parser - YAML parse function from js-yaml or yaml package
 *
 * @example
 * ```typescript
 * import yaml from 'js-yaml';
 * initYamlSupport(yaml.load);
 * ```
 */
export function initYamlSupport(parser: (input: string) => unknown): void {
  yamlParse = parser;
  yamlSupported = true;
}

// =============================================================================
// Core Parser Functions
// =============================================================================

/**
 * Parse a workflow definition from a string (JSON or YAML)
 *
 * @param input - The workflow definition string
 * @param options - Parser options
 * @returns Parse result with workflow and validation
 * @throws {WorkflowParseError} If parsing fails
 *
 * @example
 * ```typescript
 * // Parse JSON
 * const result = parseWorkflow('{"id": "my-workflow", ...}');
 *
 * // Parse YAML (requires initYamlSupport first)
 * const result = parseWorkflow(`
 * id: my-workflow
 * name: My Workflow
 * steps:
 *   - id: step1
 *     type: triage
 * `);
 * ```
 */
export function parseWorkflow(
  input: string,
  options: ParseOptions = {}
): ParseResult {
  const { validate = true, source } = options;

  // Detect format
  const trimmed = input.trim();
  const format = detectFormat(trimmed);

  // Parse based on format
  let rawData: unknown;

  try {
    if (format === 'json') {
      rawData = JSON.parse(trimmed);
    } else if (format === 'yaml') {
      if (!yamlSupported || !yamlParse) {
        throw new WorkflowParseError(
          'YAML parsing not supported. Call initYamlSupport() first.',
          source
        );
      }
      rawData = yamlParse(trimmed);
    } else {
      throw new WorkflowParseError(
        'Unable to detect format. Input must be valid JSON or YAML.',
        source
      );
    }
  } catch (err) {
    if (err instanceof WorkflowParseError) throw err;
    throw new WorkflowParseError(
      `Failed to parse ${format}: ${(err as Error).message}`,
      source,
      err as Error
    );
  }

  // Validate the parsed data as a WorkflowDefinition
  const workflow = rawData as WorkflowDefinition;

  // Run validation if requested
  let validation: WorkflowValidationResult;
  if (validate) {
    validation = validateWorkflow(workflow);
  } else {
    validation = {
      valid: true,
      errors: [],
      warnings: [],
    };
  }

  return {
    workflow,
    validation,
    format,
  };
}

/**
 * Parse a workflow and throw if invalid
 *
 * @param input - The workflow definition string
 * @param options - Parser options
 * @returns The validated workflow definition
 * @throws {WorkflowParseError} If parsing fails
 * @throws {WorkflowValidationError} If validation fails
 */
export function parseWorkflowStrict(
  input: string,
  options: Omit<ParseOptions, 'validate'> = {}
): WorkflowDefinition {
  const result = parseWorkflow(input, { ...options, validate: true });

  if (!result.validation.valid) {
    const firstError = result.validation.errors[0];
    throw firstError;
  }

  return result.workflow;
}

/**
 * Try to parse a workflow, returning null on failure
 *
 * @param input - The workflow definition string
 * @param options - Parser options
 * @returns Parse result or null if parsing failed
 */
export function tryParseWorkflow(
  input: string,
  options: ParseOptions = {}
): ParseResult | null {
  try {
    return parseWorkflow(input, options);
  } catch {
    return null;
  }
}

// =============================================================================
// File Parsing (for Node.js environments)
// =============================================================================

/**
 * Parse a workflow from a file path
 *
 * @param filePath - Path to the workflow file (.json, .yaml, or .yml)
 * @param options - Parser options
 * @returns Parse result
 */
export async function parseWorkflowFile(
  filePath: string,
  options: ParseOptions = {}
): Promise<ParseResult> {
  // Dynamic import of fs for Node.js
  const fs = await import('fs').then(m => m.promises);

  const content = await fs.readFile(filePath, 'utf-8');
  return parseWorkflow(content, { ...options, source: filePath });
}

/**
 * Parse a workflow from a file path (sync version)
 */
export function parseWorkflowFileSync(
  filePath: string,
  options: ParseOptions = {}
): ParseResult {
  // Dynamic require of fs for Node.js
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseWorkflow(content, { ...options, source: filePath });
}

// =============================================================================
// Serialization
// =============================================================================

/**
 * Serialize a workflow to JSON string
 *
 * @param workflow - The workflow definition
 * @param options - Serialization options
 * @returns JSON string
 */
export function serializeWorkflowToJson(
  workflow: WorkflowDefinition,
  options: SerializeOptions = {}
): string {
  const { pretty = true, indent = 2 } = options;
  return JSON.stringify(workflow, null, pretty ? indent : undefined);
}

/**
 * Serialize a workflow to YAML string
 *
 * @param workflow - The workflow definition
 * @param options - Serialization options
 * @returns YAML string
 * @throws {Error} If YAML support is not initialized
 */
export function serializeWorkflowToYaml(
  _workflow: WorkflowDefinition,
  _options: SerializeOptions = {}
): string {
  if (!yamlSupported) {
    throw new Error('YAML serialization not supported. Initialize YAML support first.');
  }

  // We need a yaml.dump function, but we only have yaml.load
  // For now, fall back to JSON with a note
  throw new Error(
    'YAML serialization requires yaml.dump. Use serializeWorkflowToJson instead, ' +
    'or initialize YAML support with both load and dump functions.'
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Detect the format of a workflow string
 */
function detectFormat(input: string): 'json' | 'yaml' | 'unknown' {
  const trimmed = input.trim();

  // JSON starts with { or [
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }

  // YAML typically starts with a key: value or ---
  if (
    trimmed.startsWith('---') ||
    /^[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(trimmed)
  ) {
    return 'yaml';
  }

  // Try JSON parse as fallback
  try {
    JSON.parse(trimmed);
    return 'json';
  } catch {
    // Assume YAML if not valid JSON
    return 'yaml';
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Parser options
 */
export interface ParseOptions {
  /** Whether to validate the workflow (default: true) */
  validate?: boolean;
  /** Source identifier for error messages */
  source?: string;
}

/**
 * Serialization options
 */
export interface SerializeOptions {
  /** Whether to pretty-print output (default: true) */
  pretty?: boolean;
  /** Indentation level for pretty printing (default: 2) */
  indent?: number;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for WorkflowParseError
 */
export function isWorkflowParseError(error: unknown): error is WorkflowParseError {
  return (
    error instanceof WorkflowParseError ||
    (error instanceof Error && (error as WorkflowParseError).isParseError === true)
  );
}
