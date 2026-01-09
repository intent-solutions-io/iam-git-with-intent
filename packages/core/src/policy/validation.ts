/**
 * Policy Validation
 *
 * Epic D: Policy & Audit - Story D1: Policy Definition Schema
 * Task D1.5: Add policy validation
 *
 * Comprehensive validation for policy definitions with:
 * - Schema validation (via Zod)
 * - Semantic validation (business rules)
 * - Clear, human-readable error messages
 * - Schema version migration
 *
 * @module @gwi/core/policy/validation
 */

import {
  type PolicyDocument,
  type PolicyRule,
  type PolicyCondition,
  type PolicyVersion,
  PolicyDocument as PolicyDocumentSchema,
} from './schema.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Validation error severity
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Validation error with context
 */
export interface ValidationError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable message */
  message: string;
  /** Path to the invalid field (e.g., "rules[0].conditions[1].threshold") */
  path: string;
  /** Severity level */
  severity: ValidationSeverity;
  /** Suggested fix */
  suggestion?: string;
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether the policy is valid (no errors) */
  valid: boolean;
  /** List of validation errors */
  errors: ValidationError[];
  /** List of warnings (valid but potentially problematic) */
  warnings: ValidationError[];
  /** Informational messages */
  info: ValidationError[];
  /** Validated and potentially migrated policy */
  policy?: PolicyDocument;
  /** Whether migration was applied */
  migrated: boolean;
  /** Original version before migration */
  originalVersion?: PolicyVersion;
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Whether to auto-migrate old schema versions */
  autoMigrate?: boolean;
  /** Whether to include warnings */
  includeWarnings?: boolean;
  /** Whether to include info messages */
  includeInfo?: boolean;
  /** Custom validation rules */
  customRules?: CustomValidationRule[];
}

/**
 * Custom validation rule
 */
export interface CustomValidationRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Validation function */
  validate: (policy: PolicyDocument) => ValidationError[];
}

// =============================================================================
// Error Codes
// =============================================================================

export const ValidationErrorCodes = {
  // Schema errors
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_TYPE: 'INVALID_FIELD_TYPE',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',

  // Rule errors
  DUPLICATE_RULE_ID: 'DUPLICATE_RULE_ID',
  INVALID_RULE_PRIORITY: 'INVALID_RULE_PRIORITY',
  EMPTY_CONDITIONS: 'EMPTY_CONDITIONS',
  CONFLICTING_CONDITIONS: 'CONFLICTING_CONDITIONS',

  // Condition errors
  INVALID_THRESHOLD: 'INVALID_THRESHOLD',
  INVALID_PATTERN: 'INVALID_PATTERN',
  EMPTY_PATTERN_LIST: 'EMPTY_PATTERN_LIST',

  // Action errors
  MISSING_APPROVAL_CONFIG: 'MISSING_APPROVAL_CONFIG',
  INVALID_TIMEOUT: 'INVALID_TIMEOUT',

  // Inheritance errors
  CIRCULAR_INHERITANCE: 'CIRCULAR_INHERITANCE',
  INVALID_PARENT_SCOPE: 'INVALID_PARENT_SCOPE',

  // Version errors
  UNSUPPORTED_VERSION: 'UNSUPPORTED_VERSION',
  MIGRATION_FAILED: 'MIGRATION_FAILED',

  // Warnings
  UNUSED_RULE: 'UNUSED_RULE',
  OVERLAPPING_CONDITIONS: 'OVERLAPPING_CONDITIONS',
  HIGH_COMPLEXITY: 'HIGH_COMPLEXITY',
} as const;

export type ValidationErrorCode = typeof ValidationErrorCodes[keyof typeof ValidationErrorCodes];

// =============================================================================
// Policy Validator
// =============================================================================

/**
 * Comprehensive policy validator
 */
export class PolicyValidator {
  private customRules: CustomValidationRule[] = [];

  constructor(options?: { customRules?: CustomValidationRule[] }) {
    if (options?.customRules) {
      this.customRules = options.customRules;
    }
  }

  /**
   * Validate a policy document
   */
  validate(
    input: unknown,
    options: ValidationOptions = {}
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const info: ValidationError[] = [];
    let migrated = false;
    let originalVersion: PolicyVersion | undefined;

    // Step 1: Basic schema validation
    const schemaResult = this.validateSchema(input);
    if (!schemaResult.valid) {
      return {
        valid: false,
        errors: schemaResult.errors,
        warnings: [],
        info: [],
        migrated: false,
      };
    }

    let policy = schemaResult.policy!;

    // Step 2: Version migration if needed
    if (options.autoMigrate !== false && policy.version !== '2.0') {
      originalVersion = policy.version;
      const migrationResult = this.migratePolicy(policy);
      if (migrationResult.success) {
        policy = migrationResult.policy!;
        migrated = true;
        info.push({
          code: 'MIGRATION_APPLIED',
          message: `Policy migrated from version ${originalVersion} to ${policy.version}`,
          path: 'version',
          severity: 'info',
        });
      } else {
        errors.push(...migrationResult.errors);
        return {
          valid: false,
          errors,
          warnings: [],
          info: [],
          migrated: false,
          originalVersion,
        };
      }
    }

    // Step 3: Semantic validation
    errors.push(...this.validateSemantics(policy));

    // Step 4: Warnings
    if (options.includeWarnings !== false) {
      warnings.push(...this.checkWarnings(policy));
    }

    // Step 5: Info messages
    if (options.includeInfo) {
      info.push(...this.checkInfo(policy));
    }

    // Step 6: Custom rules
    for (const rule of this.customRules) {
      const customErrors = rule.validate(policy);
      errors.push(...customErrors.filter(e => e.severity === 'error'));
      warnings.push(...customErrors.filter(e => e.severity === 'warning'));
      info.push(...customErrors.filter(e => e.severity === 'info'));
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      info,
      policy: errors.length === 0 ? policy : undefined,
      migrated,
      originalVersion,
    };
  }

  /**
   * Validate schema structure
   */
  private validateSchema(input: unknown): { valid: boolean; errors: ValidationError[]; policy?: PolicyDocument } {
    const result = PolicyDocumentSchema.safeParse(input);

    if (result.success) {
      return { valid: true, errors: [], policy: result.data };
    }

    const errors: ValidationError[] = result.error.errors.map(err => ({
      code: ValidationErrorCodes.INVALID_SCHEMA,
      message: this.formatZodError(err),
      path: err.path.join('.'),
      severity: 'error' as const,
      suggestion: this.getSuggestionForZodError(err),
    }));

    return { valid: false, errors };
  }

  /**
   * Validate semantic rules
   */
  private validateSemantics(policy: PolicyDocument): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for duplicate rule IDs
    const ruleIds = new Set<string>();
    for (let i = 0; i < policy.rules.length; i++) {
      const rule = policy.rules[i];
      if (ruleIds.has(rule.id)) {
        errors.push({
          code: ValidationErrorCodes.DUPLICATE_RULE_ID,
          message: `Duplicate rule ID '${rule.id}' found`,
          path: `rules[${i}].id`,
          severity: 'error',
          suggestion: `Use a unique ID for each rule`,
        });
      }
      ruleIds.add(rule.id);
    }

    // Validate each rule
    for (let i = 0; i < policy.rules.length; i++) {
      errors.push(...this.validateRule(policy.rules[i], `rules[${i}]`));
    }

    // Validate inheritance if parentPolicyId is set
    if (policy.parentPolicyId && policy.scope === 'global') {
      errors.push({
        code: ValidationErrorCodes.INVALID_PARENT_SCOPE,
        message: `Global policies cannot have a parent policy`,
        path: 'parentPolicyId',
        severity: 'error',
        suggestion: `Remove parentPolicyId or change scope to org, repo, or branch`,
      });
    }

    return errors;
  }

  /**
   * Validate a single rule
   */
  private validateRule(rule: PolicyRule, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for require_approval without approval config
    if (rule.action.effect === 'require_approval' && !rule.action.approval) {
      errors.push({
        code: ValidationErrorCodes.MISSING_APPROVAL_CONFIG,
        message: `Rule '${rule.id}' has effect 'require_approval' but no approval configuration`,
        path: `${path}.action.approval`,
        severity: 'error',
        suggestion: `Add approval config with minApprovers, requiredRoles, etc.`,
      });
    }

    // Validate conditions
    if (rule.conditions) {
      for (let i = 0; i < rule.conditions.length; i++) {
        errors.push(...this.validateCondition(rule.conditions[i], `${path}.conditions[${i}]`));
      }
    }

    return errors;
  }

  /**
   * Validate a condition
   */
  private validateCondition(condition: PolicyCondition, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    switch (condition.type) {
      case 'complexity':
        if (condition.threshold < 0 || condition.threshold > 10) {
          errors.push({
            code: ValidationErrorCodes.INVALID_THRESHOLD,
            message: `Complexity threshold must be between 0 and 10, got ${condition.threshold}`,
            path: `${path}.threshold`,
            severity: 'error',
            suggestion: `Use a threshold between 0 and 10`,
          });
        }
        break;

      case 'file_pattern':
        for (let i = 0; i < condition.patterns.length; i++) {
          const pattern = condition.patterns[i];
          if (!this.isValidGlobPattern(pattern)) {
            errors.push({
              code: ValidationErrorCodes.INVALID_PATTERN,
              message: `Invalid glob pattern '${pattern}'`,
              path: `${path}.patterns[${i}]`,
              severity: 'error',
              suggestion: `Use valid glob syntax (e.g., '*.ts', 'src/**/*.js')`,
            });
          }
        }
        break;

      case 'time_window':
        for (let i = 0; i < condition.windows.length; i++) {
          const window = condition.windows[i];
          if (window.startHour !== undefined && window.endHour !== undefined) {
            if (window.startHour >= window.endHour) {
              errors.push({
                code: ValidationErrorCodes.INVALID_FIELD_VALUE,
                message: `Start hour (${window.startHour}) must be less than end hour (${window.endHour})`,
                path: `${path}.windows[${i}]`,
                severity: 'error',
                suggestion: `Adjust hours so start < end, or use separate windows for overnight periods`,
              });
            }
          }
        }
        break;
    }

    return errors;
  }

  /**
   * Check for warnings (valid but potentially problematic)
   */
  private checkWarnings(policy: PolicyDocument): ValidationError[] {
    const warnings: ValidationError[] = [];

    // Warn about disabled rules
    for (let i = 0; i < policy.rules.length; i++) {
      const rule = policy.rules[i];
      if (!rule.enabled) {
        warnings.push({
          code: ValidationErrorCodes.UNUSED_RULE,
          message: `Rule '${rule.id}' is disabled`,
          path: `rules[${i}].enabled`,
          severity: 'warning',
          suggestion: `Remove disabled rules or enable them`,
        });
      }
    }

    // Warn about high rule count
    if (policy.rules.length > 50) {
      warnings.push({
        code: ValidationErrorCodes.HIGH_COMPLEXITY,
        message: `Policy has ${policy.rules.length} rules, which may impact performance`,
        path: 'rules',
        severity: 'warning',
        suggestion: `Consider splitting into multiple policies using inheritance`,
      });
    }

    // Warn about rules without conditions (matches everything)
    for (let i = 0; i < policy.rules.length; i++) {
      const rule = policy.rules[i];
      if (!rule.conditions || rule.conditions.length === 0) {
        if (!rule.conditionLogic) {
          warnings.push({
            code: ValidationErrorCodes.OVERLAPPING_CONDITIONS,
            message: `Rule '${rule.id}' has no conditions and will match all requests`,
            path: `rules[${i}].conditions`,
            severity: 'warning',
            suggestion: `Add conditions to limit the scope of this rule`,
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Check for informational messages
   */
  private checkInfo(policy: PolicyDocument): ValidationError[] {
    const info: ValidationError[] = [];

    // Info about inheritance mode
    if (policy.parentPolicyId) {
      info.push({
        code: 'INHERITANCE_ENABLED',
        message: `Policy inherits from parent with '${policy.inheritance}' mode`,
        path: 'inheritance',
        severity: 'info',
      });
    }

    return info;
  }

  /**
   * Format Zod error into human-readable message
   */
  private formatZodError(error: { message: string; path: (string | number)[]; code: string }): string {
    const path = error.path.join('.');
    const prefix = path ? `At '${path}': ` : '';

    switch (error.code) {
      case 'invalid_type':
        return `${prefix}${error.message}`;
      case 'invalid_enum_value':
        return `${prefix}${error.message}`;
      case 'too_small':
        return `${prefix}${error.message}`;
      case 'too_big':
        return `${prefix}${error.message}`;
      default:
        return `${prefix}${error.message}`;
    }
  }

  /**
   * Get suggestion for Zod error
   */
  private getSuggestionForZodError(error: { path: (string | number)[]; code: string }): string | undefined {
    const field = error.path[error.path.length - 1];

    if (field === 'name') {
      return 'Policy name is required and must be a non-empty string';
    }
    if (field === 'id') {
      return 'Rule ID must be alphanumeric with hyphens (e.g., "my-rule-1")';
    }
    if (field === 'effect') {
      return 'Valid effects are: allow, deny, require_approval, notify, log_only, warn';
    }
    if (field === 'scope') {
      return 'Valid scopes are: global, org, repo, branch';
    }

    return undefined;
  }

  /**
   * Check if a string is a valid glob pattern
   */
  private isValidGlobPattern(pattern: string): boolean {
    // Basic validation - reject obviously invalid patterns
    if (pattern.length === 0) return false;
    if (pattern.includes('***')) return false;
    // Most other patterns are valid globs
    return true;
  }

  /**
   * Add a custom validation rule
   */
  addCustomRule(rule: CustomValidationRule): void {
    this.customRules.push(rule);
  }

  /**
   * Migrate policy to latest version
   */
  migratePolicy(policy: PolicyDocument): { success: boolean; policy?: PolicyDocument; errors: ValidationError[] } {
    try {
      let migrated = { ...policy };

      // Migrate from 1.0 to 1.1
      if (migrated.version === '1.0') {
        migrated = this.migrate_1_0_to_1_1(migrated);
      }

      // Migrate from 1.1 to 2.0
      if (migrated.version === '1.1') {
        migrated = this.migrate_1_1_to_2_0(migrated);
      }

      return { success: true, policy: migrated, errors: [] };
    } catch (error) {
      return {
        success: false,
        errors: [{
          code: ValidationErrorCodes.MIGRATION_FAILED,
          message: `Failed to migrate policy: ${error instanceof Error ? error.message : 'Unknown error'}`,
          path: 'version',
          severity: 'error',
        }],
      };
    }
  }

  /**
   * Migrate from 1.0 to 1.1
   */
  private migrate_1_0_to_1_1(policy: PolicyDocument): PolicyDocument {
    return {
      ...policy,
      version: '1.1',
      // 1.1 added metadata field
      metadata: policy.metadata ?? {
        createdAt: new Date(),
        revision: 1,
      },
    };
  }

  /**
   * Migrate from 1.1 to 2.0
   */
  private migrate_1_1_to_2_0(policy: PolicyDocument): PolicyDocument {
    return {
      ...policy,
      version: '2.0',
      // 2.0 added inheritance mode (default to override)
      inheritance: policy.inheritance ?? 'override',
      // 2.0 added default action
      defaultAction: policy.defaultAction ?? {
        effect: 'deny',
        reason: 'No matching policy rule',
      },
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a policy validator instance
 */
export function createPolicyValidator(options?: { customRules?: CustomValidationRule[] }): PolicyValidator {
  return new PolicyValidator(options);
}

/**
 * Quick validation (returns boolean)
 */
export function isValidPolicy(input: unknown): boolean {
  const validator = new PolicyValidator();
  return validator.validate(input).valid;
}

/**
 * Validate and get errors
 */
export function validatePolicy(input: unknown, options?: ValidationOptions): ValidationResult {
  const validator = new PolicyValidator();
  return validator.validate(input, options);
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  ✗ [${error.code}] ${error.message}`);
      if (error.path) {
        lines.push(`    Path: ${error.path}`);
      }
      if (error.suggestion) {
        lines.push(`    Suggestion: ${error.suggestion}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  ⚠ [${warning.code}] ${warning.message}`);
      if (warning.suggestion) {
        lines.push(`    Suggestion: ${warning.suggestion}`);
      }
    }
  }

  if (result.migrated) {
    lines.push(`Note: Policy was migrated from version ${result.originalVersion} to 2.0`);
  }

  return lines.join('\n');
}
